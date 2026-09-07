import { getAura } from '../sim/combat'
import { encounterAt } from '../sim/encounters'
import type { SimState } from '../sim/types'
import { COLORS, L, MENU_TEXT, fitText } from './theme'

/**
 * First-sight explanations.
 *
 * The encounter is meant to be learned by repeating it, but a mechanic you
 * have never seen named is just an unexplained death. Each one introduces
 * itself once, the first time it appears, and never again.
 */
interface Hint {
  title: string
  advice: string
}

const HINTS: Record<string, Hint> = {
  puddle: { title: 'VOID PUDDLE', advice: 'Move out — it detonates, then lingers' },
  breath: { title: 'TIDAL BREATH', advice: 'Get out of the cone, or behind the boss' },
  shockwave: { title: 'SHOCKWAVE', advice: 'It outruns you — get INSIDE the ring, toward the boss' },
  spread: { title: 'SPREAD', advice: 'Marked player walks away from everyone else' },
  adds: { title: 'THRALLS', advice: 'They chase the nearest player — kill them first' },
  slam: { title: 'ABYSSAL SLAM', advice: 'Aimed at the tank; it needs a defensive' },
  // The only hint that points at a control rather than at the floor, and it
  // fires at the one moment that makes the control make sense: damage there
  // is no dodging. The row exists to answer exactly this and nothing else.
  // The first boss's three, because the first boss is where a player learns
  // that a card means "this is a thing, and here is what it wants".
  coldflame: { title: 'COLD LINE', advice: 'It walks outward — step off it, or stand on the boss' },
  spike: { title: 'BONE SPIKE', advice: 'They cannot move — break it to get them out' },
  bonestorm: { title: 'BONE STORM', advice: 'It has let go and is coming — keep away from it' },
  // The second boss's top rung, which is the one card in this table that has
  // to stop a player doing the obvious thing rather than start them doing
  // something. A body wearing the enemy ring has meant "kill it" everywhere
  // else in the game, and here it does not.
  dominate: { title: 'TURNED MIND', advice: 'Yours, and hostile — do NOT kill them; carry on without them' },
  // The second boss's six, for the reason at the top of this file rather than
  // for any of their own: a raid meets eight new demands on the fight after
  // the one that teaches it what a card is, and every one of them arrived
  // unnamed. Nothing here is a hint about how to play well -- each says what
  // the thing is and what it wants, once.
  volley: { title: 'FROST VOLLEY', advice: 'Nothing to dodge — everybody at once; the healers carry it' },
  decay: { title: 'ROTTING GROUND', advice: 'It stays where it fell — walk out, and do not walk back' },
  // Titled by the fight, like the tide: the boss names its own shard.
  frostbolt: { title: 'WINTER SHARD', advice: 'Aimed at whoever holds the boss — cut the cast' },
  shade: { title: 'SHADE', advice: 'It follows the one it picked — keep walking, it cannot corner you' },
  insignificance: { title: 'THE SLIGHT', advice: 'The tank loses more of its hold each time — the other tank takes it' },
  empower: { title: 'CAME BACK WRONG', advice: 'One of the wave is stronger than the rest — kill that one first' },
  // Titled by the fight at trigger time; this is only the fallback.
  raid: { title: 'CRUSHING TIDE', advice: 'Nothing to dodge — call a raid cooldown (6-0) before the next one' },
}

/**
 * Which mechanics have a card, for the check that asks whether a boss names
 * everything it sells. Exported rather than reachable, so the table stays the
 * one place a card is written down.
 */
export const HINT_KEYS: readonly string[] = Object.keys(HINTS)

const SHOW_FOR = 4.5
const SEEN_KEY = 'abyss.seen'

export class Hints {
  private seen = new Set<string>(readSeen())
  private active: { hint: Hint; age: number } | null = null

  /** Watches the fight and raises a card the first time something appears. */
  observe(s: SimState, elapsed: number): void {
    if (this.active) {
      this.active.age += elapsed
      if (this.active.age > SHOW_FOR) this.active = null
    }

    for (const g of s.ground) this.trigger(g.kind)
    // The two that are not floor: one is a body standing over somebody, the
    // other is the boss itself behaving differently. Neither would ever be
    // reached by watching the ground, and both are things a first-time player
    // meets on the first boss.
    if (s.actors.some((a) => a.spawn === 'spike' && a.alive)) this.trigger('spike')
    const b = boss(s)
    if (b && getAura(b, 'storming')) this.trigger('bonestorm')
    // A wave, and only a wave.
    //
    // It used to be "anything hostile that is not the boss", which was every
    // summon in the game at the time. It is not any more: a spike stands where
    // somebody is pinned and never moves, and a raid told "they chase the
    // nearest player — kill them first" about one is being taught a rule that
    // is false about the thing in front of them. The first boss has spikes and
    // no wave at all, so the very first card this game ever shows a player was
    // about a mechanic that fight does not have.
    if (
      s.actors.some(
        (a) =>
          a.faction === 'boss' &&
          a.alive &&
          !a.isPlayer &&
          a.id !== 100 &&
          (a.spawn === undefined || a.spawn === 'herald'),
      )
    ) {
      this.trigger('adds')
    }
    if (s.actors.some((a) => a.auras.some((au) => au.id === 'spread'))) this.trigger('spread')
    if (boss(s)?.castId === 'boss_slam') this.trigger('slam')
    // The second boss's rungs, each on the plainest thing that is true while
    // it is happening: a cast on the boss, an aura on a body, a body in the
    // wave wearing a mark. The rotting ground is already covered -- the sweep
    // over `s.ground` above triggers on its own kind.
    if (boss(s)?.castId === 'boss_frostbolt') {
      this.trigger('frostbolt', encounterAt(s.encounter).names.shard)
    }
    if (s.actors.some((a) => a.auras.some((au) => au.id === 'haunted'))) this.trigger('shade')
    if (s.actors.some((a) => a.auras.some((au) => au.id === 'slighted'))) this.trigger('insignificance')
    if (s.actors.some((a) => a.faction === 'boss' && a.auras.some((au) => au.id === 'empowered'))) {
      this.trigger('empower')
    }
    // One of the raid's own, turned. Watched on the aura rather than on the
    // chat line the fight speaks, because the line has scrolled by the time
    // anybody works out which body it meant.
    if (
      s.actors.some(
        (a) => a.faction === 'party' && a.alive && a.auras.some((au) => au.id === 'turned'),
      )
    ) {
      this.trigger('dominate')
    }
    // The raid-wide hit, on its own effect rather than on the shared sound.
    //
    // `sounds` carries 'raid' from about twenty places -- a shard landing, a
    // mind turning, a wave arriving -- so this card fired on whichever of them
    // happened first and told the player that thing was the unavoidable tide.
    // On the second boss, whose tide is deliberately the smallest in the game,
    // the first card it ever showed was about a mechanic that was not the one
    // on screen.
    for (const e of s.effects) {
      // Titled by the fight rather than by the table, for the same reason the
      // countdown is: the card names a thing the player is about to see called
      // something else on the banner above it.
      if (e.abilityId === 'boss_raid') this.trigger('raid', encounterAt(s.encounter).names.raid)
      if (e.abilityId === 'boss_volley') this.trigger('volley')
    }
  }

  private trigger(key: string, title?: string): void {
    if (this.seen.has(key)) return
    const hint = HINTS[key]
    if (!hint) return

    this.seen.add(key)
    this.active = { hint: title ? { ...hint, title } : hint, age: 0 }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen]))
    } catch {
      // Not worth failing over.
    }
  }

  /** Forgets everything, so the encounter can be learned again. */
  reset(): void {
    this.seen.clear()
    this.active = null
    try {
      localStorage.removeItem(SEEN_KEY)
    } catch {
      // Not worth failing over.
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return
    const { hint, age } = this.active

    // Fade in quickly, hold, fade out.
    const fade = Math.min(1, age / 0.25, (SHOW_FOR - age) / 0.6)
    if (fade <= 0) return

    // The panel is two lines of text and nothing else, so it is sized by
    // them: text that doubles in a box that does not prints through itself.
    const w = Math.min(L.w - 32, 420 * MENU_TEXT)
    const h = 52 * L.ui * MENU_TEXT
    const x = (L.w - w) / 2
    const y = L.bannerY - h - 11

    ctx.save()
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgba(15, 17, 26, 0.92)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = COLORS.castBar
    ctx.lineWidth = 2
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.castBar
    ctx.font = `bold ${Math.round(13 * L.ui * MENU_TEXT)}px ui-monospace, monospace`
    fitText(ctx, hint.title, x + w / 2, y + h * 0.42, w - 20)

    ctx.fillStyle = COLORS.text
    ctx.font = `${Math.round(11 * L.ui * MENU_TEXT)}px ui-monospace, monospace`
    fitText(ctx, hint.advice, x + w / 2, y + h * 0.78, w - 20)
    ctx.restore()
  }
}

function boss(s: SimState) {
  return s.actors.find((a) => a.id === 100)
}

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

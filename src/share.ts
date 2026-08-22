import { DIFFICULTIES, type DifficultyId, type RaidSize } from './sim/classes'
import { affixById } from './sim/affix'
import { ENCOUNTERS } from './sim/encounters'
import type { Daily } from './sim/daily'
import type { DailyResult } from './daily-record'

/**
 * Sharing, for a game with no server.
 *
 * There is nothing to link to — no account, no match id, no replay sitting in
 * a database. What there is instead is a simulation that reproduces exactly
 * from a seed, so a link does not have to point at a recording: it can carry
 * the fight itself, and whoever opens it gets the same boss, the same rolls
 * and the same twist to have their own go at.
 *
 * That makes a share an invitation rather than a screenshot, which is the only
 * shape worth having when the thing being compared is how it was played.
 */

/** What a link can carry. */
export interface Invite {
  /** A day's run, by its own key. Everything else is derived from the date. */
  day?: number
  /** A specific fight: boss, size, difficulty. */
  boss?: string
  size?: RaidSize
  difficulty?: DifficultyId
}

/** Reads an invite out of a URL fragment, ignoring anything it does not know. */
export function parseInvite(hash: string): Invite | null {
  // Takes a bare fragment or a whole URL, since the caller in the game has one
  // and a check written against the link builder has the other.
  const raw = hash.slice(hash.indexOf('#') + 1)
  if (raw === '') return null

  const invite: Invite = {}
  for (const part of raw.split('&')) {
    const [key, value] = part.split('=')
    if (!key || value === undefined) continue
    if (key === 'd') {
      const day = Number.parseInt(value, 10)
      // A date, not a number: eight digits, and one that could be one.
      if (Number.isFinite(day) && day > 20000101 && day < 21000101) invite.day = day
    }
    if (key === 'b' && ENCOUNTERS.some((e) => e.id === value)) invite.boss = value
    if (key === 's') {
      const size = Number.parseInt(value, 10)
      if (size === 5 || size === 10 || size === 25) invite.size = size
    }
    if (key === 'h') invite.difficulty = value === '1' ? 'heroic' : 'normal'
  }

  return invite.day !== undefined || invite.boss !== undefined ? invite : null
}

function origin(): string {
  if (typeof window === 'undefined') return ''
  const { origin: host, pathname } = window.location
  return `${host}${pathname}`
}

export function dailyLink(key: number): string {
  return `${origin()}#d=${key}`
}

export function fightLink(boss: string, size: RaidSize, difficulty: DifficultyId): string {
  return `${origin()}#b=${boss}&s=${size}&h=${difficulty === 'heroic' ? 1 : 0}`
}

function dayText(key: number): string {
  const text = String(key)
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
}

/**
 * What a day's run reads as, once somebody has had a go at it.
 *
 * Deliberately plain: the numbers are the boast and dressing them up in blocks
 * and emoji would be borrowing somebody else's game's voice.
 */
export function dailyMessage(daily: Daily, best: DailyResult | undefined): string {
  const boss = ENCOUNTERS[daily.encounter]
  const affix = affixById(daily.affix)
  const lines = [
    `Abyss — ${dayText(daily.key)}`,
    `${boss?.name ?? 'Unknown'} · ${daily.size} player · ${DIFFICULTIES[daily.difficulty].name.toLowerCase()}`,
  ]
  if (affix) lines.push(`${affix.name}: ${affix.detail}`)

  if (!best) lines.push('not attempted yet')
  else if (best.outcome === 'victory') {
    lines.push(
      `killed in ${best.time.toFixed(1)}s as ${best.spec}, on attempt ${best.attempts}`,
    )
  } else {
    lines.push(`best attempt left it at ${best.bossLeft}%, after ${best.attempts}`)
  }

  lines.push(dailyLink(daily.key))
  return lines.join('\n')
}

/** And what an ordinary kill reads as, for the results screen. */
export function killMessage(
  boss: string,
  bossId: string,
  size: RaidSize,
  difficulty: DifficultyId,
  seconds: number,
  spec: string,
  mechanics: number,
): string {
  return [
    `Abyss — ${boss}`,
    `${size} player · ${DIFFICULTIES[difficulty].name.toLowerCase()} · killed in ${seconds.toFixed(1)}s`,
    `as ${spec}, ${mechanics === 0 ? 'without eating a single mechanic' : `${mechanics} mechanics eaten`}`,
    fightLink(bossId, size, difficulty),
  ].join('\n')
}

/**
 * Hands the text to whatever the device has.
 *
 * The share sheet where there is one, the clipboard where there is not, and a
 * plain false when neither is available rather than a thrown error — a share
 * that fails is a disappointment, not a broken game.
 */
export async function share(text: string, title = 'Abyss'): Promise<'shared' | 'copied' | 'failed'> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, text })
      return 'shared'
    } catch {
      // Dismissing the sheet lands here too, which is not a failure worth
      // falling back from — but the clipboard is harmless if it was one.
    }
  }
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}

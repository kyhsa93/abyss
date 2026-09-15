/**
 * What the sky is doing, and what that does to the light.
 *
 * The art direction gave up terrain textures — the ground is grain with the
 * colour taken out — so there is almost nothing left for the land to have an
 * expression with.  Weather and light are most of what remains, and both are
 * small data: `game_weather` is 35 rows of "how often does it rain here in
 * each quarter of the year", and Elwynn is one of them at fifteen to twenty
 * per cent and never any snow.
 *
 * **It is weather and not a rule.**  The unsolved question the wiki left was
 * whether it should touch the game, and the answer written here is no: rain
 * that slowed you down would be a rule nobody could see the shape of, and the
 * one thing this repository will not do is invent a rule.  It changes the
 * light and it changes nothing else.
 */

/** `[rain, snow, storm]` per season, out of `game_weather`. */
export type Weather = number[][]

export const CLEAR = 0, RAIN = 1, SNOW = 2, STORM = 3

/**
 * Which quarter of the year it is, by the calendar the clock already uses.
 *
 * The readout shows a real time of day, so the seasons are real too: the
 * alternative is a second clock nobody asked for.
 */
export const seasonOf = (at: Date): number =>
  [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][at.getMonth()]!

/**
 * What it is doing, from the zone and the hour and nothing else.
 *
 * Derived rather than rolled, so it does not touch the stream of chance and
 * two people standing in the same place at the same time see the same sky.
 * The hour is the unit because that is roughly how long the original's weather
 * lasts, and because a sky that changes every minute is a strobe.
 */
export function skyAt(chances: Weather | undefined, at: Date, seed = 0): number {
  if (!chances) return CLEAR
  const season = chances[seasonOf(at)] ?? [0, 0, 0]
  // One number in [0, 100) a zone an hour, from the hour itself.
  const h = Math.floor(at.getTime() / 3_600_000) + seed
  let x = (h * 2654435761) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 2246822519)
  x ^= x >>> 13
  const roll = ((x >>> 0) % 10000) / 100
  const [rain = 0, snow = 0, storm = 0] = season
  if (roll < storm) return STORM
  if (roll < storm + snow) return SNOW
  if (roll < storm + snow + rain) return RAIN
  return CLEAR
}

/**
 * The colour behind the world, by the hour and the weather.
 *
 * A single ground colour, because the scene paints the whole glass with it
 * before anything else and the tiles are tinted over the top.  Night is not
 * black — nothing in this game happens at night that you would want to be
 * unable to see — it is blue and dim, which is the difference between an
 * evening and a power cut.
 */
export function lightAt(at: Date, sky: number): { ground: string; tint: number; rgb: [number, number, number] } {
  const hour = at.getHours() + at.getMinutes() / 60
  // Dawn at six, dusk at eight, which is what the original's outdoor light
  // does over a long summer's day and is the only shape worth having.
  const day = hour < 5 || hour > 21 ? 0
    : hour < 7 ? (hour - 5) / 2
      : hour > 19 ? 1 - (hour - 19) / 2
        : 1
  const wet = sky === CLEAR ? 0 : sky === RAIN ? 0.35 : sky === SNOW ? 0.2 : 0.55
  const lit = day * (1 - wet * 0.5)
  const r = Math.round(10 + lit * 17)
  const g = Math.round(14 + lit * 22)
  const b = Math.round(24 + lit * 8)
  return { ground: `rgb(${r},${g},${b})`, tint: lit, rgb: [r, g, b] }
}

/**
 * The brightest the colour behind the world ever gets: a clear noon.
 *
 * A room is composed once and kept while the hour goes on turning behind it,
 * so anything in a room that has to stand out from the backdrop has to stand
 * out from this one — the backdrop's darker hours are further away, not
 * nearer.
 */
export const BACKDROP_MOST = lightAt(new Date(2026, 5, 21, 12), CLEAR).rgb

/** Our word for it, for the readout. */
export const SKY_WORD: Record<number, string> = {
  0: '', 1: '비', 2: '눈', 3: '폭풍',
}

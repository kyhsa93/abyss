/**
 * What the icon tooling needs to know about each ability.
 *
 * Two things, and both are read off the tables the simulation runs on rather
 * than written out by hand: the list of abilities, which `iconmatch` gives to
 * the picker, and what school an ability plainly belongs to, which `atlas`
 * tints by. An ability that changes cannot drift away from its own icon,
 * because nothing here is a second copy of what it is.
 */

import { ABILITIES } from '../src/sim/abilities'

export { elementOf } from '../src/render/element'

export interface IconJob {
  id: string
  name: string
}

/**
 * Every ability the bar can show, in a fixed order.
 *
 * Sorted by id rather than by declaration, so the atlas built from these is the
 * same file when `abilities.ts` gets a new entry in the middle.
 */
export function iconJobs(): IconJob[] {
  return Object.values(ABILITIES)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((ability) => ({ id: ability.id, name: ability.name }))
}

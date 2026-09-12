/**
 * The interface: what the player can see about themselves and about what they
 * are hitting.
 *
 * Until now there was one thing on the screen and it was a developer's
 * readout — tile counts, frame rate, the coordinates of the camera — with the
 * player's health wedged into it as a line of text.  That is an instrument
 * panel, not an interface. This is the other thing: two unit frames and a bar
 * of actions, which is the shape the game this is modelled on settled on and
 * the reason it is legible at a glance.
 *
 * Built out of DOM rather than painted into the canvas, for the same reason
 * `talk.ts` is: text.  A health bar is easy either way, but `26 / 102` in
 * Korean at nine pixels on a phone is a font-fallback problem, and the browser
 * has already solved it.
 *
 * Nothing here knows any rules.  It is handed numbers and it shows them.
 */

/** What one frame shows. `null` hides it. */
export type Unit = {
  name: string
  level: number
  hp: number
  max: number
  /** Icon path under `art/ui`, already including the artist's directory. */
  icon: string
  foe: boolean
} | null

export type Slot = {
  key: string
  label: string
  icon: string
  /** 0 while ready, 1 the moment it was used — the sweep fills back down. */
  cooling: number
  /** Greyed out when there is nothing to use it on. */
  live: boolean
}

const ICONS = './art/ui/'

function el(tag: string, cls?: string, into?: HTMLElement): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (into) into.appendChild(e)
  return e
}

function frame(into: HTMLElement, id: string) {
  const root = el('div', 'frame', into)
  root.id = id
  const icon = el('img', 'face', root) as HTMLImageElement
  const body = el('div', 'body', root)
  const top = el('div', 'top', body)
  const name = el('span', 'name', top)
  const level = el('span', 'lv', top)
  const bar = el('div', 'bar', body)
  const fill = el('div', 'fill', bar)
  const text = el('span', 'num', bar)
  return { root, icon: icon as HTMLImageElement, name, level, fill, text }
}

export function hud() {
  const ui = el('div')
  ui.id = 'ui'
  document.body.appendChild(ui)

  const units = el('div', '', ui)
  units.id = 'units'
  const me = frame(units, 'me')
  const foe = frame(units, 'foe')
  foe.root.hidden = true

  // The experience bar sits under the player rather than across the bottom of
  // the screen, because the bottom of the screen on a phone is two thumbs.
  const xpBar = el('div', 'xp', me.root.parentElement!)
  const xpFill = el('div', 'fill', xpBar)
  const xpText = el('span', 'num', xpBar)

  // The bag.  A list rather than a grid of squares: what is in it is counted
  // goods — eleven of cloth — and a grid of squares is a lie about that until
  // items are things in their own right.
  const bagPanel = el('div', '', ui)
  bagPanel.id = 'bag'
  bagPanel.hidden = true
  const bagTitle = el('div', 'title', bagPanel)
  const bagList = el('ul', '', bagPanel)

  const bar = el('div', '', ui)
  bar.id = 'bar'
  const slots: { root: HTMLElement; icon: HTMLImageElement; sweep: HTMLElement }[] = []

  let shown: Slot[] = []

  return {
    /** The player's own frame, which is always there. */
    setMe(u: NonNullable<Unit>) {
      me.icon.src = ICONS + u.icon
      me.name.textContent = u.name
      me.level.textContent = `${u.level}`
      const part = Math.max(0, Math.min(1, u.hp / u.max))
      me.fill.style.width = `${part * 100}%`
      me.fill.style.background = part > 0.5 ? '#4f9e46' : part > 0.2 ? '#c9a33a' : '#b8402f'
      me.text.textContent = `${Math.round(u.hp)} / ${u.max}`
    },

    /** What is being hit, or nothing. */
    setFoe(u: Unit) {
      foe.root.hidden = u === null
      if (!u) return
      foe.icon.src = ICONS + u.icon
      foe.name.textContent = u.name
      foe.level.textContent = `${u.level}`
      const part = Math.max(0, Math.min(1, u.hp / u.max))
      foe.fill.style.width = `${part * 100}%`
      foe.fill.style.background = u.foe ? '#b8402f' : '#4f9e46'
      foe.text.textContent = `${Math.round(u.hp)} / ${u.max}`
    },

    /** What you are carrying, and whether anybody is looking at it. */
    setBag(open: boolean, purse: string, items: [string, number][]) {
      bagPanel.hidden = !open
      if (!open) return
      bagTitle.textContent = `가방  —  ${purse}`
      const want = items.map(([w, n]) => `${w} ${n}`).join('\n')
      if (bagList.dataset['now'] === want) return
      bagList.dataset['now'] = want
      bagList.textContent = ''
      if (items.length === 0) {
        el('li', 'empty', bagList).textContent = '비어 있다'
        return
      }
      for (const [word, many] of items) {
        const li = el('li', '', bagList)
        el('span', 'what', li).textContent = word
        el('span', 'many', li).textContent = `${many}`
      }
    },

    setXp(have: number, need: number, level: number) {
      const part = need > 0 ? Math.max(0, Math.min(1, have / need)) : 0
      xpFill.style.width = `${part * 100}%`
      xpText.textContent = need > 0 ? `${have} / ${need}` : `${level}레벨`
    },

    /**
     * The action bar.
     *
     * Rebuilt only when the set of actions changes, which is never yet — but
     * the cooling sweep and the lit state are set every frame, and those are
     * two style writes rather than a new element.
     */
    setBar(next: Slot[]) {
      if (next.length !== slots.length) {
        bar.textContent = ''
        slots.length = 0
        for (const s of next) {
          const root = el('div', 'slot', bar)
          const icon = el('img', '', root) as HTMLImageElement
          icon.src = ICONS + s.icon
          const sweep = el('div', 'sweep', root)
          el('span', 'key', root).textContent = s.key
          el('span', 'name', root).textContent = s.label
          slots.push({ root, icon, sweep })
        }
        shown = []
      }
      for (let i = 0; i < next.length; i++) {
        const s = next[i]!, w = slots[i]!
        // Compared against what was last *shown*, and `shown` used to be
        // assigned before this loop — so on the frame the bar was built every
        // slot compared equal to itself and none of them ever lit up.
        if (shown[i]?.live !== s.live) w.root.classList.toggle('live', s.live)
        w.sweep.style.transform = `scaleY(${Math.max(0, Math.min(1, s.cooling))})`
      }
      shown = next.map((s) => ({ ...s }))
    },
  }
}

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

/**
 * One square on the bar.  An empty one is a square with a key on it and
 * nothing in it, which is what the bar looks like before you have learned
 * anything — the twelve are always there and most of them are always empty.
 */
export type Slot = {
  key: string
  label: string
  /** Empty when there is nothing in this square. */
  icon: string
  /** What hovering over it says. */
  tip: string
  /** Clicking it does what pressing its key does. */
  use?: () => void
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
  // The swing, as a bar under the player rather than as a number.  It is the
  // only timer in the game and it is the one thing a player is waiting on.
  const swingBar = el('div', 'swing', me.root.parentElement!)
  const swingFill = el('div', 'fill', swingBar)
  const foe = frame(units, 'foe')
  foe.root.hidden = true
  // What the target is fighting, which is nearly always you — and when it is
  // not, that is the thing worth knowing.
  const foeFoe = el('div', 'oftarget', units)
  foeFoe.hidden = true

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

  // The minimap.  Painted by the scene rather than here, because what is on
  // it is the ground and only the scene knows that — this owns the canvas and
  // the ring of chrome around it.
  const mapBox = el('div', '', ui)
  mapBox.id = 'map'
  const mapCv = el('canvas', '', mapBox) as HTMLCanvasElement
  mapCv.width = mapCv.height = 150
  const mapWhere = el('div', 'where', mapBox)
  const mapClock = el('div', 'clock', mapBox)

  // What just happened, newest last, which is the way every game's log reads
  // and the opposite of the way every feed does.
  const logBox = el('div', '', ui)
  logBox.id = 'log'
  const lines: HTMLElement[] = []

  // The character sheet.  Everything the fight arithmetic is working from,
  // said once in one place — because the numbers exist and nothing showed them.
  const sheet = el('div', '', ui)
  sheet.id = 'sheet'
  sheet.hidden = true

  // One tooltip, moved about.  Two would be two things to keep in step.
  const tip = el('div', '', ui)
  tip.id = 'tip'
  tip.hidden = true

  // The buttons that are always there: what opens, rather than what you do.
  const micro = el('div', '', ui)
  micro.id = 'micro'

  const bar = el('div', '', ui)
  bar.id = 'bar'
  const slots: { root: HTMLElement; icon: HTMLImageElement; sweep: HTMLElement }[] = []

  let shown: Slot[] = []
  /** What the bar is showing right now, for the handlers to read. */
  let shownNow: Slot[] = []
  let microNow: { key: string; label: string; on: boolean; use: () => void }[] = []

  const this_ = {
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
    setBag(open: boolean, purse: string, items: [string, number, string][]) {
      bagPanel.hidden = !open
      if (!open) return
      bagTitle.textContent = `가방  —  ${purse}`
      const want = items.map(([w, n, t]) => `${w} ${n} ${t}`).join('\n')
      if (bagList.dataset['now'] === want) return
      bagList.dataset['now'] = want
      bagList.textContent = ''
      if (items.length === 0) {
        el('li', 'empty', bagList).textContent = '비어 있다'
        return
      }
      for (const [word, many, worth] of items) {
        const li = el('li', '', bagList)
        el('span', 'what', li).textContent = word
        el('span', 'many', li).textContent = `${many}`
        li.onmouseenter = () => {
          const box = li.getBoundingClientRect()
          this_.setTip(`${word} ${many}\n팔면 ${worth}`, box.left + box.width / 2, box.top - 4)
        }
        li.onmouseleave = () => this_.setTip(null, 0, 0)
      }
    },

    /** The minimap's own canvas, for the scene to paint into. */
    map: mapCv,

    /** Where the player is, under the map, and what time it is. */
    setWhere(text: string, time: string) {
      if (mapWhere.textContent !== text) mapWhere.textContent = text
      if (mapClock.textContent !== time) mapClock.textContent = time
    },

    /** How far through the swing, 0 to 1. */
    setSwing(part: number) {
      swingFill.style.width = `${Math.max(0, Math.min(1, part)) * 100}%`
    },

    /** What the target is fighting, or nothing. */
    setOfTarget(text: string | null) {
      foeFoe.hidden = text === null
      if (text !== null && foeFoe.textContent !== text) foeFoe.textContent = text
    },

    /**
     * The buttons down the corner.  Built once — what they open never changes,
     * only whether it is open.
     */
    setMicro(buttons: { key: string; label: string; on: boolean; use: () => void }[]) {
      if (micro.children.length !== buttons.length) {
        micro.textContent = ''
        buttons.forEach((b, i) => {
          const el2 = el('button', '', micro)
          el2.textContent = b.label
          el2.onclick = () => microNow[i]?.use()
          el2.onmouseenter = () => {
            const r = el2.getBoundingClientRect()
            this_.setTip(`${b.label}  (${b.key})`, r.left + r.width / 2, r.top - 4)
          }
          el2.onmouseleave = () => this_.setTip(null, 0, 0)
        })
      }
      microNow = buttons
      buttons.forEach((b, i) => {
        const el2 = micro.children[i] as HTMLElement
        el2.classList.toggle('on', b.on)
      })
    },

    /**
     * One more line in the log.
     *
     * Capped at what fits rather than at a round number: a log that scrolls
     * is a log nobody reads, and the ten most recent lines are the ones that
     * are still about what you are doing.
     */
    log(text: string, kind: 'hit' | 'hurt' | 'gain' | 'note') {
      const li = el('div', kind, logBox)
      li.textContent = text
      lines.push(li)
      while (lines.length > 7) lines.shift()!.remove()
    },

    /** The character sheet, or nothing. */
    setSheet(open: boolean, rows: [string, string][]) {
      sheet.hidden = !open
      if (!open) return
      const want = rows.map(([k, v]) => `${k}\t${v}`).join('\n')
      if (sheet.dataset['now'] === want) return
      sheet.dataset['now'] = want
      sheet.textContent = ''
      el('div', 'title', sheet).textContent = '주인공'
      for (const [k, v] of rows) {
        const line = el('div', 'row', sheet)
        el('span', 'k', line).textContent = k
        el('span', 'v', line).textContent = v
      }
    },

    /** The tooltip, at a point on the screen, or nothing. */
    setTip(text: string | null, x: number, y: number) {
      tip.hidden = text === null
      if (text === null) return
      if (tip.textContent !== text) tip.textContent = text
      tip.style.left = `${Math.round(x)}px`
      tip.style.top = `${Math.round(y)}px`
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
        next.forEach((s, i) => {
          const root = el('div', 'slot', bar)
          if (!s.icon) root.classList.add('bare')
          const icon = el('img', '', root) as HTMLImageElement
          if (s.icon) icon.src = ICONS + s.icon
          else icon.remove()
          const sweep = el('div', 'sweep', root)
          el('span', 'key', root).textContent = s.key
          el('span', 'name', root).textContent = s.label
          // The handlers read the *current* slot rather than the one this
          // closure was built with, because the bar is rebuilt only when its
          // length changes and everything else about a slot moves every frame.
          root.onmouseenter = () => {
            const box = root.getBoundingClientRect()
            this_.setTip(shownNow[i]?.tip ?? s.tip, box.left + box.width / 2, box.top - 6)
          }
          root.onmouseleave = () => this_.setTip(null, 0, 0)
          root.onclick = () => shownNow[i]?.use?.()
          if (!s.icon) { root.onmouseenter = null; root.onclick = null }
          slots.push({ root, icon, sweep })
        })
        shown = []
      }
      shownNow = next
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
  return this_
}

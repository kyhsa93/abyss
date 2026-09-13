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
import { layoutFor } from './touch.ts'

/** What one frame shows. `null` hides it. */
export type Unit = {
  name: string
  level: number
  hp: number
  max: number
  /** Icon path under `art/ui`, already including the artist's directory. */
  icon: string
  /**
   * The portrait, if the scene has drawn one.
   *
   * `PlayerFrame.xml` puts a 64 by 64 `PlayerPortrait` at the head of twenty
   * textures, and what the client puts in it is the character's own face.
   * Ours was `sbed/health-normal` — a white cross — while fifty-eight layer
   * sheets of that same character sat in `public/art/doll/` unread.  The
   * target's was a wolf's head or a sword, chosen from two, while the
   * creature's own four-direction sprite was already cut.
   */
  face?: HTMLCanvasElement | null
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
  // A box rather than the image itself, so a portrait the scene has drawn can
  // take its place.  The client's own is 64 by 64 and holds the character's
  // face; ours held a white cross.
  const face = el('div', 'face', root)
  const icon = el('img', '', face) as HTMLImageElement
  const body = el('div', 'body', root)
  const top = el('div', 'top', body)
  const name = el('span', 'name', top)
  const level = el('span', 'lv', top)
  const bar = el('div', 'bar', body)
  const fill = el('div', 'fill', bar)
  const text = el('span', 'num', bar)
  return { root, face, icon: icon as HTMLImageElement, name, level, fill, text }
}

/** One frame's place, as `pipeline/layout.py` reads it out of the client. */
export type Box = { at: string; x: number; y: number; w: number; h: number }
export type Layout = {
  ref: [number, number]
  frames: Record<string, Box>
  /**
   * The rest of the interface as numbers — see `spec` in `pipeline/layout.py`.
   *
   * The type scale, the border thicknesses, the insets and the bar colours,
   * all of them literals out of `FrameXML`.  `index.html` had 229 hand-typed
   * pixel values and 87 hand-picked colours, and some of those colours were
   * in places where the client says what they are: our rage bar was
   * `#a32d22` where it says (1, 0, 0), our experience bar `#5b3fa8` where it
   * says (0.58, 0, 0.55).
   */
  spec?: {
    edge: number[]
    inset: number[][]
    tile: number[]
    font?: number[]
    shadow?: number[][]
    colour: Record<string, number[]>
    unread: string[]
  }
  /**
   * Which windows share a place on the screen — `UIPanelWindows`, read by
   * `pipeline/layout.py`.  `area` is left / center / doublewide / full and
   * `push` is how far a window will slide to let another in: 0 means the one
   * already there closes.
   */
  panels?: Record<string, { area: string; push: number }>
}

/**
 * Put a panel where the original puts it.
 *
 * The interface was the last thing here with no source: the terrain comes out
 * of `.adt` files and the abilities out of `Spell.dbc`, and the screen was
 * laid out from memory.  So it kept being wrong one piece at a time — the
 * gossip window was a strip across the bottom sitting on top of the action
 * bar, when the original pins it 384 wide against the **left** edge.
 *
 * `pipeline/layout.py` reads `FrameXML` and writes the anchor and the size.
 * What is applied here is that anchor, not a box on a 1024 by 768 screen: a
 * box would drift towards the middle of a wider monitor, and an anchor is what
 * the original actually holds on to.
 */
function pin(node: HTMLElement, b: Box | undefined, s: number) {
  if (!b) return
  const at = b.at
  node.style.position = 'fixed'
  node.style.width = `${Math.round(b.w * s)}px`
  // Height is left to the content for anything that grows: a gossip window
  // with three lines in it should be three lines tall, and the original's 512
  // is the parchment's, which we do not have.
  // Every side is set, and the ones this anchor does not use are set to
  // `auto` rather than removed.  Removing only clears the inline value: the
  // stylesheet's own `right: 12px` survived it, so a panel pinned by its left
  // edge stayed stretched to the right edge as well and came out three times
  // the width it asked for.
  node.style.transform = 'none'
  node.style.left = node.style.right = 'auto'
  node.style.top = node.style.bottom = 'auto'
  // Never off the glass.  The original's player frame is at -19 because its
  // portrait art carries nineteen pixels of transparent margin on that side;
  // ours has no such margin, so the negative offset is an inset into art that
  // does not exist here and it hung the frame over the edge.
  if (at.includes('LEFT')) node.style.left = `${Math.round(Math.max(0, b.x) * s)}px`
  else if (at.includes('RIGHT')) node.style.right = `${Math.round(Math.max(0, b.x) * s)}px`
  else {
    node.style.left = '50%'
    node.style.transform = `translateX(calc(-50% + ${Math.round(b.x * s)}px))`
  }
  if (at.includes('TOP')) node.style.top = `${Math.round(b.y * s)}px`
  else if (at.includes('BOTTOM')) node.style.bottom = `${Math.round(b.y * s)}px`
  else node.style.top = `${Math.round((384 + b.y) * s)}px`
}

export function hud(layout?: Layout) {
  const helpLine = document.getElementById('help') as HTMLElement
      ?? document.createElement('div')
  const ui = el('div')
  ui.id = 'ui'
  document.body.appendChild(ui)

  const units = el('div', '', ui)
  units.id = 'units'
  const me = frame(units, 'me')
  // Rage, under health.  A resource bar that nothing spends is a bar that
  // lies, so this arrived with the four things that spend it.
  const rageBar = el('div', 'rage', me.root.parentElement!)
  const rageFill = el('div', 'fill', rageBar)
  const rageText = el('span', 'num', rageBar)
  // The swing, as a bar. The original's cast bar is 195 by 13 sitting 55 above
  // the bottom edge — just over the action bar — and this is the same timer in
  // the same place.  It used to be a strip under the player's health, which is
  // where nothing in that game puts one.
  const swingBar = el('div', '', ui)
  swingBar.id = 'swing'
  const swingFill = el('div', 'fill', swingBar)
  // What is on you goes under you, and what is on the target goes under the
  // target.  Both were appended at the end, which put them under the
  // experience bar and made the two strips indistinguishable.
  const mine = el('div', 'auras', units)
  const foe = frame(units, 'foe')
  foe.root.hidden = true
  // What the target is fighting, which is nearly always you — and when it is
  // not, that is the thing worth knowing.
  const theirs = el('div', 'auras', units)
  const foeFoe = el('div', 'oftarget', units)
  foeFoe.hidden = true

  // The experience bar goes across the bottom of the screen, on the top edge
  // of the action bar, which is where the original has it — `MainMenuExpBar`,
  // 1024 by 13, anchored to the bar's top.  On a phone the bottom of the
  // screen is two thumbs, so `body.touch` puts it back under the player.
  const xpBar = el('div', '', ui)
  xpBar.id = 'xp'
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

  // The whole zone, drawn once and then looked at.  A minimap is where you
  // are; a map is where that is.
  const worldBox = el('div', '', ui)
  worldBox.id = 'world'
  worldBox.hidden = true
  const worldTitle = el('div', 'title', worldBox)
  const worldCv = el('canvas', '', worldBox) as HTMLCanvasElement
  const worldFoot = el('div', 'foot', worldBox)
  const worldPin = el('div', 'pin', worldBox)

  // The character sheet.  Everything the fight arithmetic is working from,
  // said once in one place — because the numbers exist and nothing showed them.
  const sheet = el('div', '', ui)
  sheet.id = 'sheet'
  sheet.hidden = true

  // What you are in the middle of, kept on the right where the original keeps
  // its tracker — the one panel in that game that is always up and never
  // opened.  A quest log you have to open is a quest log nobody reads.
  const track = el('div', '', ui)
  track.id = 'track'
  track.hidden = true

  // One tooltip, moved about.  Two would be two things to keep in step.
  const tip = el('div', '', ui)
  tip.id = 'tip'
  tip.hidden = true

  // The buttons that are always there: what opens, rather than what you do.
  const micro = el('div', '', ui)
  micro.id = 'micro'
  // Into the deck, to the right of the buttons, where the original's bags are.

  // The bottom of the screen is one assembly, as it is in the original: a
  // single `MainMenuBar` holds the action buttons *and* the bag and menu
  // buttons, and the whole thing is centred.  Ours were two panels centred
  // independently, so on a narrow window they walked into each other.
  const deck = el('div', '', ui)
  deck.id = 'deck'
  const bar = el('div', '', deck)
  bar.id = 'bar'
  const slots: { root: HTMLElement; icon: HTMLImageElement; sweep: HTMLElement }[] = []

  let shown: Slot[] = []
  /** What the bar is showing right now, for the handlers to read. */
  let shownNow: Slot[] = []
  /**
   * What the bar was last *built* from — key, label and picture per square.
   *
   * It used to be the count, and the count never changed: the caller always
   * sends twelve squares and pads the end with empties, so after the first
   * frame the bar was frozen.  Eight things bought from a trainer went into
   * the spellbook and none of them ever appeared, while the log kept saying
   * there was something new to learn.
   */
  let builtFrom = ''
  let microNow: { key: string; label: string; on: boolean; use: () => void }[] = []

  /**
   * Put a face in a frame: the scene's picture if there is one, the icon if
   * not.
   *
   * Swapped rather than redrawn, because a canvas the scene owns is a canvas
   * the scene keeps up to date — the paperdoll is recomposed only when what
   * is worn changes, and the portrait is the same picture.
   */
  const wear = (f: ReturnType<typeof frame>, u: NonNullable<Unit>) => {
    if (u.face) {
      if (f.face.firstChild !== u.face) {
        f.face.textContent = ''
        f.face.appendChild(u.face)
      }
      f.icon.hidden = true
      return
    }
    f.icon.hidden = false
    if (f.icon.parentElement !== f.face) f.face.appendChild(f.icon)
    f.icon.src = ICONS + u.icon
  }

  const this_ = {
    /** The player's own frame, which is always there. */
    setMe(u: NonNullable<Unit>) {
      wear(me, u)
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
      wear(foe, u)
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
    /** And the world map's, which the scene paints once. */
    world: worldCv,

    /** Where you are on it, as a fraction of its width and height. */
    setPin(x: number, y: number) {
      worldPin.style.left = `${x * 100}%`
      worldPin.style.top = `${y * 100}%`
    },

    /** Show or hide the world map, and say what is under the cursor. */
    setWorld(open: boolean, title: string, foot: string) {
      const was = worldBox.hidden
      worldBox.hidden = !open
      if (was !== worldBox.hidden) seat()
      if (!open) return
      if (worldTitle.textContent !== title) worldTitle.textContent = title
      if (worldFoot.textContent !== foot) worldFoot.textContent = foot
    },

    /** Where the player is, under the map, and what time it is. */
    setWhere(text: string, time: string) {
      if (mapWhere.textContent !== text) mapWhere.textContent = text
      if (mapClock.textContent !== time) mapClock.textContent = time
    },

    setRage(now: number, most: number) {
      rageFill.style.width = `${Math.max(0, Math.min(1, now / most)) * 100}%`
      rageText.textContent = `${Math.round(now)}`
    },

    /**
     * The little squares: what is on you, and what is on the target.
     *
     * Rebuilt whenever the set changes, which is rarely — an aura arrives and
     * leaves, and in between only the number under it moves.
     */
    setAuras(who: 'me' | 'foe', got: { icon: string; left: number; text: string }[]) {
      const box = who === 'me' ? mine : theirs
      const key = got.map((a) => a.icon).join('|')
      if (box.dataset['now'] !== key) {
        box.dataset['now'] = key
        box.textContent = ''
        for (const a of got) {
          const cell = el('div', 'aura', box)
          const img = el('img', '', cell) as HTMLImageElement
          img.src = ICONS + a.icon
          el('span', '', cell)
          cell.onmouseenter = () => {
            const r = cell.getBoundingClientRect()
            this_.setTip(a.text, r.left + r.width / 2, r.top - 4)
          }
          cell.onmouseleave = () => this_.setTip(null, 0, 0)
        }
      }
      got.forEach((a, i) => {
        const span = box.children[i]?.querySelector('span')
        const want = a.left > 0 ? `${Math.ceil(a.left)}` : ''
        if (span && span.textContent !== want) span.textContent = want
      })
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
    setSheet(open: boolean, rows: [string, string][], doll?: HTMLCanvasElement) {
      const was = sheet.hidden
      sheet.hidden = !open
      if (was !== sheet.hidden) seat()
      if (!open) return
      const want = rows.map(([k, v]) => `${k}\t${v}`).join('\n')
      if (sheet.dataset['now'] === want) return
      sheet.dataset['now'] = want
      sheet.textContent = ''
      el('div', 'title', sheet).textContent = '주인공'
      // The paperdoll, if the scene has drawn one.  It goes at the top,
      // because that is the one thing on this panel that is a picture of you
      // rather than a number about you.
      if (doll) {
        const box = el('div', 'doll', sheet)
        box.appendChild(doll)
      }
      for (const [k, v] of rows) {
        const line = el('div', 'row', sheet)
        el('span', 'k', line).textContent = k
        el('span', 'v', line).textContent = v
      }
    },

    /**
     * What you are in the middle of: a title and its lines, ticked or not.
     *
     * No ids and no prose — `talk.ts` has already turned the shape into
     * sentences and this only lays them out.
     */
    setErrands(jobs: { lines: [string, boolean][]; done: boolean }[]) {
      track.hidden = jobs.length === 0
      const want = JSON.stringify(jobs)
      if (track.dataset['now'] === want) return
      track.dataset['now'] = want
      track.textContent = ''
      el('div', 'title', track).textContent = '할 일'
      for (const j of jobs) {
        const box = el('div', j.done ? 'job done' : 'job', track)
        for (const [text, got] of j.lines) {
          el('div', got ? 'line got' : 'line', box).textContent = text
        }
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
      const shape = next.map((s) => `${s.key}\u0000${s.label}\u0000${s.icon}`)
        .join('\u0001')
      if (shape !== builtFrom) {
        builtFrom = shape
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
          // Attached to every square, empty ones included.  They used to be
          // torn off when a square was built bare — `onclick = null` — and
          // since the bar was never rebuilt, a square that filled up later was
          // dead for the rest of the session.  An empty square answers by
          // having nothing to say: `use` is undefined and `tip` is ''.
          root.onmouseenter = () => {
            const tip = shownNow[i]?.tip ?? s.tip
            if (!tip) return
            const box = root.getBoundingClientRect()
            this_.setTip(tip, box.left + box.width / 2, box.top - 6)
          }
          root.onmouseleave = () => this_.setTip(null, 0, 0)
          root.onclick = () => shownNow[i]?.use?.()
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
  /**
   * Everything that has a place in the original, put there.
   *
   * Re-run on resize, because an anchor is only an anchor if it follows the
   * edge it is anchored to.  `body.touch` opts out: a phone is 390 by 664 and
   * the original was never laid out for one, so the stylesheet's own rules
   * stand there — which is the honest answer rather than a shrunken copy.
   */
  /** Everything either layout touches, so the other one can start clean. */
  const placed = () => [units, foe.root, mapBox, logBox, bagPanel, sheet, deck,
    bar, micro, xpBar, swingBar, helpLine, track,
    document.getElementById('talk')].filter(Boolean) as HTMLElement[]

  const loose = (node: HTMLElement) => {
    for (const k of ['position', 'left', 'right', 'top', 'bottom',
      'width', 'height', 'transform'] as const) node.style.removeProperty(k)
  }

  /** Pins one box by whichever sides are named, clearing the rest. */
  const put = (node: HTMLElement, box: Partial<Record<
    'left' | 'right' | 'top' | 'bottom' | 'width' | 'height', number>>) => {
    loose(node)
    node.style.position = 'fixed'
    node.style.transform = 'none'
    for (const k of ['left', 'right', 'top', 'bottom'] as const) {
      node.style[k] = box[k] === undefined ? 'auto' : `${Math.round(box[k]!)}px`
    }
    for (const k of ['width', 'height'] as const) {
      if (box[k] !== undefined) node.style[k] = `${Math.round(box[k]!)}px`
    }
  }

  /**
   * The phone, laid out on purpose.
   *
   * What stood here handed every panel back to the stylesheet and called that
   * the honest answer.  It was not.  `#micro`, `#xp` and `#swing` have no
   * `position` of their own, so with their pins removed they fell into normal
   * flow inside a layer that covers the screen — and the menu came out as a
   * 390-pixel column of full-width rows across the top half of the glass,
   * with the experience bar floating above it and the minimap behind it.  The
   * rules written for them in the stylesheet (`top: 152px`, `right: 8px`)
   * never applied at all, because a static box has no sides to hold on to.
   *
   * So this is the old prototype's answer instead, which that game worked out
   * on the same screen: **the four corners are the interface and the middle is
   * the game.**  Top left is who you are, top right is where you are, the
   * right edge carries what opens, and the bottom third belongs to two thumbs
   * and to nothing else.
   *
   * The floor of that bottom third is not a guess.  It is `layoutFor` — the
   * same function that draws the stick and the buttons onto the canvas — so
   * the log stops where the ring starts and the menu stops where the cluster
   * starts.  Nothing in CSS can ask where a thumb is, which is why the
   * backpack used to open on top of the attack button.
   */
  const placePhone = () => {
    const w = window.innerWidth, h = window.innerHeight
    const l = layoutFor(w, h)
    // The two numbers that say where the interface has to stop: the top of
    // the stick's ring at rest, and the top of the button cluster.
    const stickTop = l.home.y - l.base
    // The autocast toggle sits above the cluster, so the cluster's top is
    // higher than its buttons: without it the menu landed on the toggle.
    const clusterTop = Math.min(l.autoAt.y - l.autoR,
      ...l.slots.map((s) => s.y - l.btnR))
    const floor = Math.min(stickTop, clusterTop)
    // Held sideways a phone has width and no height, which is the opposite of
    // the problem, so the interface spreads along the top instead of stacking
    // down the right.  The old prototype's layout branched on exactly this.
    const tall = h >= w

    // Top left: who you are — and the two strips that belong to him.  They
    // are the original's bottom-of-the-screen strips, and the bottom of this
    // screen is a thumb.
    const col = Math.min(190, Math.round(w * 0.5))
    put(units, { left: 8, top: 8, width: col })
    const under = 8 + units.offsetHeight + 4
    // Twelve and not ten: the number written down the middle of it has a
    // line box of its own, and a ten-pixel bar clipped the bottom off `0 / 400`.
    put(xpBar, { left: 8, top: under, width: col, height: 12 })
    put(swingBar, { left: 8, top: under + 14, width: col, height: 3 })

    // Top right: where you are.  Smaller lying down, where the whole screen
    // is 390 tall and a 150-pixel circle is most of it.
    const dial = tall ? 98 : 78
    const face = mapBox.querySelector('canvas') as HTMLElement | null
    if (face) { face.style.width = `${dial}px`; face.style.height = `${dial}px` }
    // Wider than the circle, because the plate under it carries a place name
    // and the weather: sized to the dial alone, 노스샤이어 계곡 wrapped onto
    // two lines in a box meant for one.
    put(mapBox, { right: 8, top: 8, width: Math.max(dial + 6, 118) })
    // The plates under the circle are part of the box, so whatever comes next
    // clears all of it and not just the canvas.
    const below = 8 + mapBox.offsetHeight + 6

    // What opens.  Standing up it is a block two wide against the right edge,
    // stopped short of the cluster; a column of five would have run into it,
    // and five full-width rows — which is what there was — ran into
    // everything.  Lying down there is a whole top edge free between the
    // player's frame and the map, so it goes there as one row.
    if (micro.parentElement === deck) ui.appendChild(micro)
    // How it is shaped is a class and not an inline style.  Written inline it
    // beat the stylesheet, and the rule that takes the menu away while
    // somebody is talking — `body.touch.talking #micro` — never fired, so
    // five buttons that answer a press floated over the answers.
    // Written only when it changes: the observer at the end of this file
    // watches this attribute and `toggle` rewrites it either way, so an
    // unconditional write here made `place` call itself.
    if (document.body.classList.contains('lying') === tall) {
      document.body.classList.toggle('lying', !tall)
    }
    if (tall) put(micro, { right: 8, bottom: h - clusterTop + 10, width: 116 })
    else put(micro, { left: col + 20, top: 8 })
    // The deck is the bar plus the menu, and on a phone the bar is the two
    // round buttons on the canvas and the menu has just left.
    deck.style.display = 'none'

    // What you are in the middle of, down the right edge under the map, and
    // cut off rather than allowed to grow into whatever is under it.
    const roof = tall ? micro.getBoundingClientRect().top : floor
    put(track, { right: 8, top: below, width: 134,
      height: Math.max(0, roof - below - 8) })
    track.style.overflow = 'hidden'

    // What just happened, above the stick rather than under it.
    const room = stickTop - under - 24
    put(logBox, { left: 8, bottom: h - stickTop + 8, width: 160,
      height: Math.max(36, Math.min(88, room)) })

    // How to play, under the player's own block — which is the one strip of
    // either screen that is neither a corner nor a thumb.  A fixed width
    // rather than a span, because an invisible box the width of the screen is
    // still a box and everything else has to dodge it.
    put(helpLine, { left: 8, top: under + 20, width: 200 })
    helpLine.style.textAlign = 'center'

    // The backpack is a sheet here, not a corner panel — the corner it took
    // is the attack button — and the stylesheet centres it like the other
    // two, so all this has to do is stop holding it in a corner.
    loose(bagPanel)

    // The numbers readout is a developer's and a phone has no corner spare
    // for one, so it opens across the width under the top band — over the
    // tracker, which is not a thing anybody reads while staring at frame
    // times.  It is a panel you opened, like the other three.
    const numbers = document.getElementById('hud')
    if (numbers) put(numbers, { left: 8, top: below, width: w - 16 })

    // And the ones the stylesheet already centres are left centred.
    for (const node of [sheet, document.getElementById('talk')]) {
      if (node) loose(node)
    }
  }

  /**
   * Which panels are up, in the order they went up.
   *
   * The original's own answer to two windows wanting one place, and the half
   * of `FrameXML` this repository had not read.  `layout.py` took the anchors
   * and left the rule behind, so the gossip window and the character sheet
   * both came out at `TOPLEFT 0, 104` — 418 by 129, exactly on top of each
   * other, with the shopkeeper's words showing through a panel at 88% alpha.
   *
   * It was never a misreading.  The client really does put them in the same
   * place, **because they are never both up**: `UIPanelWindows` says the
   * character frame is `left, pushable 3` and the gossip window is `left,
   * pushable 0`, and the left place holds one at a time unless the newcomer
   * is willing to slide over.
   */
  const upAt = new Map<string, number>()
  let opened = 0
  /** Panels the seating rule says have to go, for the scene to act on. */
  const evicted = new Set<string>()

  const seat = () => {
    const rule = layout?.panels
    if (!rule || document.body.classList.contains('touch')) return
    const box = (name: string): HTMLElement | null =>
      name === 'sheet' ? sheet
        : name === 'talk' ? document.getElementById('talk')
          : name === 'world' ? worldBox : null
    // Who is up now, and since when.
    for (const name of Object.keys(rule)) {
      const el = box(name)
      if (!el) continue
      if (el.hidden) upAt.delete(name)
      else if (!upAt.has(name)) upAt.set(name, ++opened)
    }
    // `full` is the whole screen.  A window that takes it takes everybody
    // else's place too, which is why the world map leaving the gossip window
    // up in the corner was wrong in the original's terms as well as in ours.
    for (const [name, r] of Object.entries(rule)) {
      if (r.area !== 'full' || !upAt.has(name)) continue
      for (const other of [...upAt.keys()]) {
        if (other !== name) { evicted.add(other); upAt.delete(other) }
      }
    }
    for (const area of new Set(Object.values(rule).map((r) => r.area))) {
      const here = [...upAt.keys()]
        .filter((n) => rule[n]?.area === area)
        .sort((a, b) => upAt.get(a)! - upAt.get(b)!)
      let edge = 0
      for (let i = 0; i < here.length; i++) {
        const name = here[i]!, el = box(name)!
        if (i === 0) { edge = el.offsetWidth; el.style.removeProperty('margin-left'); continue }
        // A window that will not slide evicts whoever is sitting there.  That
        // is `pushable = 0`, and it is why the two share an anchor at all.
        if ((rule[name]?.push ?? 0) === 0) {
          for (const gone of here.slice(0, i)) { evicted.add(gone); upAt.delete(gone) }
          edge = 0
          el.style.removeProperty('margin-left')
          continue
        }
        // Otherwise it sits beside what is already there, which is what
        // `pushable` counts: how many places along it is willing to go.
        el.style.marginLeft = `${edge + 8}px`
        edge += el.offsetWidth + 8
      }
      // And anything not up gets its offset back, so it opens where it
      // belongs next time.
      for (const name of Object.keys(rule)) {
        if (rule[name]?.area === area && !upAt.has(name)) {
          box(name)?.style.removeProperty('margin-left')
        }
      }
    }
  }

  /**
   * The values the client states, written on to the page as variables.
   *
   * Not a theme and not a redesign: only the numbers `FrameXML` actually
   * says, so that the ones left in the stylesheet are visibly *ours*.  What
   * the client does not say — the gold of our borders, the alpha of the
   * gossip panel, the phone layout — stays hand-written and is now the only
   * hand-written thing, which is the point.
   */
  const spell = () => {
    const sp = layout?.spec
    if (!sp) return
    const root = document.documentElement.style
    const rgb = (c?: number[]) => c
      ? `rgb(${c.map((v) => Math.round(v * 255)).join(',')})` : null
    for (const [k, name] of [['rage', '--rage'], ['mana', '--mana'],
      ['energy', '--energy'], ['xp', '--xp'], ['xpRested', '--xp-rested']] as const) {
      const v = rgb(sp.colour[k])
      if (v) root.setProperty(name, v)
    }
    // The type scale, smallest four of the thirteen: this interface is a
    // readout and a label, not a book.
    const f = (sp.font ?? []).filter((v) => v >= 10 && v <= 14)
    ;['--font-tiny', '--font-small', '--font-med', '--font-large']
      .forEach((n, i) => { if (f[i]) root.setProperty(n, `${f[i]}px`) })
    // **Not the border.**  `edgeSize` is 12 or 16 and it is the width of a
    // nine-slice *artwork* frame; ours is a one-pixel CSS line, and there is
    // no scale that turns one into the other — applied, every panel in the
    // game grew a three-pixel rim.  A number the client states is not
    // automatically a number we can use, and saying which is which is the
    // whole point of carrying the spec.
    const sh = (sp.shadow ?? [])[0]
    if (sh) root.setProperty('--shadow', `${sh[0]}px ${-sh[1]!}px 0 #000`)
  }
  spell()

  const place = () => {
    if (document.body.classList.contains('touch')) return placePhone()
    deck.style.removeProperty('display')
    if (document.body.classList.contains('lying')) {
      document.body.classList.remove('lying')
    }
    helpLine.style.removeProperty('text-align')
    track.style.removeProperty('overflow')
    const face = mapBox.querySelector('canvas') as HTMLElement | null
    if (face) { face.style.removeProperty('width'); face.style.removeProperty('height') }
    if (!layout) {
      for (const node of placed()) loose(node)
      return
    }
    // The original is laid out against a 768-tall screen.  Smaller than that
    // and everything has to come in together or the panels overlap; larger and
    // it stays at its own size, which is what that game does too.
    const s = Math.max(0.62, Math.min(1, window.innerHeight / layout.ref[1]))
    const f = layout.frames
    pin(units, f['units'], s)
    pin(foe.root.parentElement === units ? foe.root : foe.root, f['target'], s)
    pin(mapBox, f['map'], s)
    pin(logBox, f['log'], s)
    // The log keeps the height the original gives it — 430 by 120 — because
    // it is a box things scroll through rather than a box that grows.  Left to
    // its content it was nought tall when empty, so nothing below it knew it
    // was there and the key hints were printed straight through it.
    logBox.style.height = `${Math.round((f['log']?.h ?? 120) * s)}px`
    pin(bagPanel, f['bag'], s)
    pin(sheet, f['sheet'], s)
    if (micro.parentElement !== deck) deck.appendChild(micro)
    pin(deck, f['bar'], s)
    // `max-content` and not `auto`: a fixed box anchored at `left: 50%` with
    // no right gets a shrink-to-fit width capped at half the window, so the
    // twelve buttons and the menu row were squeezed into each other and the
    // last four slots came out underneath the buttons.
    deck.style.width = 'max-content'
    bar.style.position = 'static'
    micro.style.position = 'static'
    micro.style.removeProperty('right')
    micro.style.removeProperty('bottom')
    pin(xpBar, f['xp'], s)
    pin(swingBar, f['cast'], s)
    // The strips above the deck stack the way the original stacks them, off
    // our own deck rather than off its absolute offsets.  In the original the
    // action buttons sit 4 up from the bar's bottom and are 36 tall, ending at
    // 40 — which is exactly where the experience bar starts, and the cast bar
    // clears that by two.  Those numbers are inside a 53-pixel art frame we do
    // not have; the *relationship* is what transfers.
    const tall = deck.offsetHeight
    xpBar.style.bottom = `${Math.round(tall)}px`
    // Measured and not computed: the strip's own border makes it fifteen where
    // the source says thirteen, and two scaled pixels of gap round to nothing
    // on a small window, so the two touched.
    swingBar.style.bottom = `${Math.round(tall + xpBar.offsetHeight) + 2}px`
    // The backpack clears the whole deck.  The original's 70 clears its own
    // 53 plus 13 of experience bar with four to spare, and that is the rule.
    const floor = tall + xpBar.offsetHeight + 4
    bagPanel.style.bottom =
      `${Math.round(Math.max((f['bag']?.y ?? 70) * s, floor))}px`
    // The key hints sit above the chat log.  The original has no such line —
    // it teaches with tooltips — so there is nothing to copy and it takes the
    // one corner nothing else wants.
    helpLine.style.position = 'fixed'
    helpLine.style.left = `${Math.round((f['log']?.x ?? 32) * s)}px`
    helpLine.style.right = 'auto'
    helpLine.style.top = 'auto'
    helpLine.style.bottom =
      `${Math.round((f['log']?.y ?? 95) * s) + logBox.offsetHeight + 6}px`
    const talk = document.getElementById('talk')
    if (talk) pin(talk, f['talk'], s)
    // The tracker goes under the minimap on the right, which is where that
    // game puts it and the one strip of screen nothing else wants.
    const m = f['map']
    if (m) {
      track.style.position = 'fixed'
      track.style.left = track.style.bottom = 'auto'
      track.style.transform = 'none'
      track.style.right = `${Math.round(m.x * s) + 8}px`
      track.style.top = `${Math.round((m.y + m.h) * s) + 40}px`
    }
    // The bar is the original's full width and ours is twelve buttons; what
    // matters is that it sits on the bottom edge, so the width goes back to
    // the content and only the anchor is kept.
    bar.style.width = 'auto'
    sheet.style.height = 'auto'
    if (talk) talk.style.height = 'auto'
    bagPanel.style.height = 'auto'
  }
  place()
  window.addEventListener('resize', place)
  // And whenever the scene works out that this is a phone.  `place` runs once
  // at construction, *before* the first touch, so it has already pinned every
  // panel to `FrameXML`'s coordinates by the time anybody knows there is a
  // thumb involved — and the touch branch only hands those back the next time
  // it runs.  Without this the gossip window stayed pinned to the top of a
  // phone's screen, over the person talking, which is the one thing the touch
  // rules exist to avoid.  It looked like flakiness because it depended on
  // whether a resize happened to fire first.
  new MutationObserver(place).observe(document.body,
    { attributes: true, attributeFilter: ['class'] })
  // And again whenever the bar changes size, because the strips above it are
  // stacked off its height and the bar is empty until the scene fills it: the
  // first run measured nought and put the experience bar under the floor.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => place()).observe(bar)
  }

  return {
    ...this_,
    place,
    /** Re-run the seating rule; the scene calls this when a window opens. */
    seat,
    /**
     * Panels the seating rule has closed, taken once.
     *
     * Returned rather than acted on, because the scene owns whether a window
     * is open — `sheetOpen` is a boolean in `main.ts` — and a panel the hud
     * hid behind its back would spring open again on the next frame.
     */
    evicted(): string[] {
      const out = [...evicted]
      evicted.clear()
      return out
    },
  }
}

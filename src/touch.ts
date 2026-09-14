/**
 * The controls a phone has, which is a thumb and another thumb.
 *
 * This is the old prototype's touch layer rebuilt for a world you walk around
 * rather than a fight you stand in, and the three things it got right are kept
 * because each of them was a bug first.
 *
 *   * The stick goes where the thumb lands.  A stick drawn in a fixed corner
 *     is a target you have to look down at, and looking down is the one thing
 *     a player will not do.  It is still *drawn* in a corner at rest, so that
 *     a phone shows its controls before being poked.
 *   * Buttons answer to the nearest press, not the first one that fits.  The
 *     hit radius is wider than the button so a thumb landing beside one still
 *     counts, and once the radii overlap, "first match" means the lowest slot
 *     eats the edge of its neighbours.
 *   * Every finger is tracked by its `pointerId`.  Sharing one piece of state
 *     between fingers is how a stick ends up stuck on: the finger that let go
 *     was not the finger that was steering.
 *
 * Touch mode is detected up front rather than on the first touch — otherwise a
 * phone shows no controls at all until the player happens to poke the screen —
 * and any key press hides it again, because a laptop with a touchscreen is a
 * keyboard until proved otherwise.
 */

export type Push = { x: number; y: number }

/** Everything the overlay is, in canvas pixels, out of the canvas's size. */
export type Layout = {
  base: number; knob: number; home: Push
  btnR: number; hit: number; slots: Push[]
  /**
   * The autocast toggle, above the cluster and a little smaller.
   *
   * The old prototype had one and this rewrite left it out.  It is a thing
   * you set once a fight rather than a thing you press, so it sits out of the
   * path of a thumb going for its rotation — which is the whole reason it is
   * above rather than among them.
   */
  autoAt: Push; autoR: number
  /** Where the page turn sits, above the corner button. */
  pageAt: Push; pageR: number
}

/**
 * A push shorter than this much of the ring is not a push.
 *
 * Without it a thumb resting on the glass walks you into the lake: a finger
 * that is not moving still reports a pixel or two of jitter, and the stick
 * turns any non-zero length into a full-speed unit vector.
 */
const DEADZONE = 0.24

/**
 * Five, as before.  One action is one slot; the shape is there for the rest.
 *
 * The corner is always the attack, so **four of the five turn**: a character
 * with sixteen abilities is four pages deep and every one of them is under a
 * thumb in at most three presses of the page ring.  Five buttons was never
 * the problem — five buttons *and no way past them* was, which is issue 203.
 */
const MAX_SLOTS = 5
export const FIXED_SLOTS = 1
export const PER_PAGE = MAX_SLOTS - FIXED_SLOTS

/**
 * How much of each edge the phone itself has taken.
 *
 * `env(safe-area-inset-*)` read through a probe element, because CSS can
 * answer this and script cannot.  Worked out by hand for an iPhone 13 at 390
 * by 844: the buttons are drawn down to y 818 and their hit circles to 831,
 * and the home indicator's band starts at 810 — so both thumbs' resting
 * places sat eight to twenty-one pixels inside it, and the first push upward
 * from there is a system gesture rather than a step.
 */
let inset: { bottom: number; left: number; right: number } | null = null
function safeArea() {
  if (inset) return inset
  inset = { bottom: 0, left: 0, right: 0 }
  if (typeof document === 'undefined') return inset
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;'
    + 'bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);'
    + 'right:env(safe-area-inset-right)'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  inset = {
    bottom: parseFloat(cs.bottom) || 0,
    left: parseFloat(cs.left) || 0,
    right: parseFloat(cs.right) || 0,
  }
  probe.remove()
  return inset
}

/**
 * The smallest screen this game is laid out for.
 *
 * Two documents said two things — the interface page proposed 1024 x 640 for a
 * desktop and the phone page worked to 390 x 664 — and 640 is under 664, so
 * the pair could not both be a floor.  Neither was measured.
 *
 * This is, and it is the one the harness already holds the layout to:
 * `padcheck` lays the screen out at 360 x 640 and asserts that nothing the
 * interface draws sits on a thumb.  360 x 640 is a real phone rather than a
 * round number, it is smaller than both proposals, and a desktop is never
 * smaller than a phone — so one number retires both.  Issue 203.
 *
 * Exported because the check reads it: a floor written down in a document and
 * a floor the layout is tested at are two numbers, and two numbers drift.
 */
export const MIN_SCREEN = { width: 360, height: 640 }

export function layoutFor(w: number, h: number): Layout {
  const safe = safeArea()
  const small = Math.min(w, h)
  // Half of what it was, by the owner's decision.  The cluster drawn at 58
  // across took the bottom-right quarter of a phone, and what is under that
  // corner is the thing you are fighting.  Everything about a button is a
  // multiple of this one number — the hit circle, the gap between slots, the
  // row offset, the autocast toggle — so halving it halves the cluster
  // whole rather than leaving five small discs spread over the old area.
  const btnR = clamp(small * 0.0375, 13, 20)
  const base = clamp(small * 0.14, 54, 92)
  const btnX = w - btnR - 18 - safe.right
  const gap = btnR * 2.25
  const row = gap * 0.87
  const bottom = h - btnR - 26 - safe.bottom
  return {
    base, knob: base * 0.42,
    home: { x: base + 26 + safe.left, y: h - base - 26 - safe.bottom },
    btnR, hit: btnR * 1.45,
    // Two offset rows gathered into the corner, the order they are pressed in,
    // so slot one is the corner itself — the easiest place on a phone to
    // reach.  A column up the right edge is a shape a thumb travels rather
    // than covers.
    slots: [
      { x: btnX, y: bottom },
      { x: btnX - gap, y: bottom },
      { x: btnX - gap * 2, y: bottom },
      { x: btnX - gap * 0.5, y: bottom - row },
      { x: btnX - gap * 1.5, y: bottom - row },
    ],
    autoAt: { x: btnX - gap, y: bottom - row * 2 - 4 },
    autoR: btnR * 0.82,
    // Beside the autocast toggle and over the corner, which is the column a
    // thumb is already in.  Same size, because they are the same kind of
    // thing: two little switches that change what the five below do.
    pageAt: { x: btnX, y: bottom - row * 2 - 4 },
    pageR: btnR * 0.82,
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function hasTouch(): boolean {
  return typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0
}

/** What one slot looks like this frame. */
export type Slot = { label: string; ready: boolean; cooling?: number
  /**
   * The picture on its face, as a path under `public/art/ui/`.
   *
   * The word is what a square had when a square was 58 pixels across.  Halved,
   * `정신 집중` fits inside a 29-pixel disc only at a six-pixel font, which is
   * a word nobody can read pretending to be a label — and there is a picture
   * for every ability now (issue 155).  So the face is the picture, the word
   * is what a press and hold answers with, and `padcheck` was already testing
   * that press.
   */
  icon?: string }

/**
 * The icons, decoded once and kept.
 *
 * An `<img>` a frame is a fetch a frame; drawn from a cache it is a blit.  A
 * miss draws nothing rather than throwing, which is the same bargain the tile
 * atlas makes: a button with no picture is a button, and a button that stops
 * the frame is not.
 */
const faces = new Map<string, HTMLImageElement>()
function faceOf(path: string): HTMLImageElement | null {
  const got = faces.get(path)
  if (got) return got.complete && got.naturalWidth ? got : null
  const img = new Image()
  img.src = `./art/ui/${path}`
  faces.set(path, img)
  return null
}

export function touchpad(canvas: HTMLCanvasElement, count: number) {
  const slots = Math.min(count, MAX_SLOTS)
  // The same stack the page uses, read once rather than written twice: a
  // canvas font falls back on its own, and a Latin-first list draws 대화 in
  // whichever Hangul font the machine happens to have first.
  const face = getComputedStyle(document.documentElement)
    .getPropertyValue('--mono').trim() || 'monospace'
  let on = hasTouch()
  let busy = false
  /** Where the current finger went down, for telling a tap from a drag. */
  let down: { at: Push; id: number } | null = null

  /**
   * Where the stick is, and only while a finger is on it.
   *
   * Nothing is cached at rest: the first version parked the stick at its home
   * position in the constructor, which ran before the canvas had been given
   * the window's size, so a phone opened with its stick drawn in the *top*
   * left corner until it was first touched.  At rest the position is the
   * layout's, worked out from whatever the canvas measures now.
   */
  let stick: number | null = null
  let ox = 0, oy = 0, kx = 0, ky = 0

  /** pointerId -> slot, so the finger that let go clears the right button. */
  const onButton = new Map<number, number>()
  const pressed = new Set<number>()
  const queued: number[] = []
  /** The slot a finger has been resting on long enough to want an answer. */
  let holding: { slot: number; at: Push; since: number } | null = null
  let asked: number | null = null

  /** Fingers that landed on nothing: one of them steers, two of them pinch. */
  const free = new Map<number, Push>()
  let pinchGap = 0
  let scale = 1
  let tap: Push | null = null
  /** Whether the player has asked to keep swinging — see `autoAt`. */
  let auto = false
  /**
   * Which page of abilities the four turning slots are showing.
   *
   * Held here rather than in `main.ts` because it is a property of the *pad*:
   * a keyboard has sixteen squares and never turns a page, and the scene
   * should not have to know which of its two interfaces is on screen.  How
   * many pages there are is whatever the caller hands `draw`, so the number
   * follows the spellbook without anybody telling it.
   */
  let page = 0
  let pages = 1

  function layout(): Layout {
    return layoutFor(canvas.width, canvas.height)
  }

  /** Where a pointer is in the canvas's own pixels, which are not the page's. */
  function at(e: PointerEvent): Push {
    const r = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    }
  }

  /** Nearest button within reach, not the first one that contains the point. */
  function hit(p: Push, l: Layout): number | null {
    let best: number | null = null, gap = Infinity
    for (let i = 0; i < slots; i++) {
      const b = l.slots[i]!
      const d = Math.hypot(p.x - b.x, p.y - b.y)
      if (d <= l.hit && d < gap) { gap = d; best = i }
    }
    return best
  }

  function release() {
    stick = null
  }

  /** The ring and the knob, in canvas pixels — at rest, both are the home. */
  function where() {
    if (stick === null) {
      const h = layout().home
      return { ox: h.x, oy: h.y, kx: h.x, ky: h.y }
    }
    return { ox, oy, kx, ky }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // A mouse only drives the pad once the pad is already showing.  Otherwise
    // a click on the world quietly relocates a stick nobody can see, and the
    // hero walks off while the player wonders what they pressed.
    if (e.pointerType === 'mouse' && !on) return
    if (e.pointerType === 'touch') on = true
    const p = at(e)
    // Where the finger went down, so the lift can tell a tap from a drag.
    //
    // **Cleared again by the two switches below**, and that is not tidiness:
    // a press on the autocast toggle or the page turn used to lift as a *tap
    // on the world*, so turning a page also picked a target — and picking a
    // target opens nothing but `setBusy` runs on the frame after, which
    // swallowed the next press outright.  Every other press either captures
    // the pointer or is a genuine tap; these two are neither.
    // `tap` used to be set *here* — on the way down, before anything knew
    // whether it would move — so dragging the stick while a conversation was
    // open counted as tapping the world and closed it.  A conversation that
    // ends when you touch the stick is a conversation that ends at random,
    // which is what it looked like from outside.
    down = { at: p, id: e.pointerId }

    if (busy) return
    const l = layout()
    // Above the cluster and checked first: a thumb that lands on it wanted
    // it, and the hit radius of the buttons below reaches up here.
    if (Math.hypot(p.x - l.autoAt.x, p.y - l.autoAt.y) <= l.autoR * 1.3) {
      e.preventDefault()
      down = null
      auto = !auto
      return
    }
    // And the page turn beside it, on the same rule and checked before the
    // buttons for the same reason.  It wraps, because a phone control that
    // dead-ends makes you press it three times to go back one.
    if (pages > 1
      && Math.hypot(p.x - l.pageAt.x, p.y - l.pageAt.y) <= l.pageR * 1.3) {
      e.preventDefault()
      down = null
      page = (page + 1) % pages
      return
    }
    const slot = hit(p, l)
    if (slot !== null) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      onButton.set(e.pointerId, slot)
      // An edge, not a held state: one press fires one action however many
      // frames the finger stays down for.
      if (!pressed.has(slot)) { pressed.add(slot); queued.push(slot) }
      holding = { slot, at: p, since: performance.now() }
      return
    }

    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    free.set(e.pointerId, p)
    if (free.size === 2) {
      // A second finger on open ground means the camera, not a second stick.
      // The first one stops steering rather than steering to wherever the
      // pinch drags it.
      const [a, b] = [...free.values()]
      pinchGap = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      release()
    } else if (free.size === 1) {
      stick = e.pointerId
      ox = kx = p.x
      oy = ky = p.y
    }
  })

  canvas.addEventListener('pointermove', (e) => {
    if (!free.has(e.pointerId)) return
    const p = at(e)
    free.set(e.pointerId, p)
    if (free.size === 2) {
      const [a, b] = [...free.values()]
      const gap = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      if (pinchGap > 0 && gap > 0) scale *= gap / pinchGap
      pinchGap = gap
      return
    }
    if (e.pointerId === stick) { kx = p.x; ky = p.y }
  })

  /** How far a finger may travel and still be a tap. */
  const TAP_SLOP = 12
  /**
   * How long a finger has to stay on a button before it explains itself.
   *
   * `body.touch #tip { display: none }` was the right call and half a
   * decision: a hover tooltip on a screen with no pointer appears *under* the
   * finger asking for it.  What it left is a phone where the only thing an
   * ability says about itself is one word on its face, while the desktop
   * tooltip carries the rage cost, the cooldown, the global cooldown and the
   * reason it cannot be used right now.
   *
   * Half a second, which is the shortest hold that is not a tap.
   */
  const HOLD = 500

  function up(e: PointerEvent) {
    // A tap is a press and a lift in the same place.  Anything that travelled
    // is a drag, and a drag on the world is not an answer to anything.
    if (down && down.id === e.pointerId) {
      const p = at(e)
      if (Math.hypot(p.x - down.at.x, p.y - down.at.y) <= TAP_SLOP) tap = p
      down = null
    }
    if (holding) { holding = null; asked = null }
    const slot = onButton.get(e.pointerId)
    if (slot !== undefined) {
      onButton.delete(e.pointerId)
      // Only unlatch once no finger at all is left on that button.
      if (![...onButton.values()].includes(slot)) pressed.delete(slot)
      return
    }
    free.delete(e.pointerId)
    if (e.pointerId === stick) release()
    // Lifting one of a pinch leaves a finger on the glass that was never
    // steering.  Letting it take the stick from wherever it happens to be
    // yanks the player sideways, so the stick stays down until a fresh press.
    if (free.size < 2) pinchGap = 0
  }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  addEventListener('keydown', () => { on = false })
  // A finger that leaves with the tab still counts as lifted.
  addEventListener('blur', () => {
    onButton.clear(); pressed.clear(); free.clear(); pinchGap = 0; release()
  })

  return {
    /** Whether the overlay is showing at all. */
    get on() { return on },

    /** Screen-space push, already a unit vector, or null for nothing. */
    push(): Push | null {
      if (stick === null || busy) return null
      const dx = kx - ox, dy = ky - oy
      const len = Math.hypot(dx, dy)
      if (len <= layout().base * DEADZONE) return null
      return { x: dx / len, y: dy / len }
    },

    /** Slots pressed since the last call, in the order they were pressed. */
    taken(): number[] {
      const out = queued.slice()
      queued.length = 0
      return out
    },

    /** How much the pinch has zoomed since the last call, as a multiplier. */
    pinch(): number {
      const s = scale
      scale = 1
      return s
    },

    /** Where the stick is drawn, which is also what the check reads. */
    view() {
      return { ...where(), held: stick !== null, fingers: free.size, busy }
    },

    /**
     * Which button a finger is holding down and where, or null.
     *
     * Read every frame by the scene, which draws the same text the desktop
     * tooltip carries — above the finger, because the point of the press is
     * that the finger is in the way.
     */
    held(): { slot: number; at: Push } | null {
      if (!holding) return null
      if (performance.now() - holding.since < HOLD) return null
      asked = holding.slot
      return { slot: holding.slot, at: holding.at }
    },
    /** Whether the last press was long enough to be a question. */
    get asking() { return asked !== null },

    /** Whether autocast is on, which the scene reads every frame. */
    get auto() { return auto },
    /**
     * Which page of abilities the four turning slots are showing, and how
     * many there are.
     *
     * Read by the scene twice — once to pick what to draw on the buttons and
     * once to work out what a press meant — and **those two have to be the
     * same number**, which is why it is one field here rather than one in
     * each.  A bar drawn from one index and fired from another is the shape
     * that puts the wrong spell under the right picture.
     */
    get page() { return page },
    get pages() { return pages },

    /** A tap and where it landed, consumed by the reading. */
    takeTap(): Push | null {
      const p = tap
      tap = null
      return p
    },

    /**
     * Hands the screen to something else — a conversation — which takes the
     * controls away rather than leaving them under the panel: a thumb reaching
     * for an answer should not walk you out of earshot of the question.
     */
    setBusy(b: boolean) {
      if (busy === b) return
      busy = b
      onButton.clear(); pressed.clear(); free.clear(); pinchGap = 0
      queued.length = 0
      down = null
      release()
    },

    draw(ctx: CanvasRenderingContext2D, bar: Slot[], howMany = 1) {
      // **How many pages there are is taken before the guard.**  Behind it the
      // count went stale whenever the pad was not drawing — a conversation, a
      // keyboard — so a character who learned two abilities mid-conversation
      // came back to a cluster that still thought it had one page, and the
      // count only caught up on the frame after it was next needed.
      pages = Math.max(1, howMany)
      if (page >= pages) page = 0
      if (!on || busy) return
      const l = layout()
      // The toggle, above the cluster.
      ring(ctx, l.autoAt.x, l.autoAt.y, l.autoR,
        auto ? 'rgba(90,150,80,.45)' : 'rgba(12,14,20,.62)',
        auto ? '#7fc46a' : 'rgba(107,102,88,.7)', 2)
      ctx.fillStyle = auto ? '#dff3d6' : 'rgba(232,228,216,.45)'
      ctx.font = `bold ${Math.round(l.autoR * 0.5)}px ${face}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('자동', l.autoAt.x, l.autoAt.y + 1)
      // The page turn, drawn only when there is one.  A character with four
      // abilities has one page and no ring — a control that does nothing is
      // a control that costs a thumb's worth of glass for nothing.
      if (pages > 1) {
        ring(ctx, l.pageAt.x, l.pageAt.y, l.pageR,
          'rgba(12,14,20,.62)', 'rgba(201,168,106,.8)', 2)
        ctx.fillStyle = '#e8e4d8'
        ctx.font = `bold ${Math.round(l.pageR * 0.62)}px ${face}`
        ctx.fillText(`${page + 1}/${pages}`, l.pageAt.x, l.pageAt.y + 1)
      }

      const w = where()
      const dx = w.kx - w.ox, dy = w.ky - w.oy
      const len = Math.hypot(dx, dy)
      const clamped = len > l.base ? l.base / len : 1
      ring(ctx, w.ox, w.oy, l.base, 'rgba(12,14,20,.42)', 'rgba(74,68,51,.85)', 2)
      ring(ctx, w.ox + dx * clamped, w.oy + dy * clamped, l.knob,
        stick === null ? 'rgba(201,168,106,.28)' : 'rgba(201,168,106,.55)', '#c9a86a', 2)

      for (let i = 0; i < slots && i < bar.length; i++) {
        const b = l.slots[i]!
        const s = bar[i]!
        const held = pressed.has(i)
        ring(ctx, b.x, b.y, l.btnR,
          held ? 'rgba(201,168,106,.34)' : 'rgba(12,14,20,.62)',
          s.ready ? '#c9a86a' : 'rgba(107,102,88,.7)', s.ready ? 3 : 2)
        // The wait, drawn as a shutter falling across the button rather than
        // as a number — the same thing the desktop bar does with `sweep`, and
        // the reason a global cooldown is visible on a phone at all.
        if ((s.cooling ?? 0) > 0) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(b.x, b.y, l.btnR - 1, 0, Math.PI * 2)
          ctx.clip()
          ctx.fillStyle = 'rgba(0,0,0,.55)'
          const up = Math.min(1, s.cooling!) * l.btnR * 2
          ctx.fillRect(b.x - l.btnR, b.y - l.btnR, l.btnR * 2, up)
          ctx.restore()
        }
        // The picture, or the word if there is none.  See `Slot.icon`.
        const pic = s.icon ? faceOf(s.icon) : null
        if (pic) {
          const wide = l.btnR * 1.15
          ctx.globalAlpha = s.ready ? 1 : 0.4
          ctx.drawImage(pic, b.x - wide / 2, b.y - wide / 2, wide, wide)
          ctx.globalAlpha = 1
        } else {
          ctx.fillStyle = s.ready ? '#e8e4d8' : 'rgba(232,228,216,.35)'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          fit(ctx, s.label, b.x, b.y + 1, l.btnR * 1.7, l.btnR * 0.4, face)
        }
      }
    },
  }
}

/**
 * A label drawn no wider than the thing it is written on.
 *
 * The buttons were halved and the labels were not, because a font size taken
 * off the radius shrinks the glyphs and not the word: `정신 집중` is four
 * Hangul syllables and a space, and at a fifteen-pixel ring it hung a full
 * ring's width out of either side of its own button.  Measuring is the only
 * way to know — a Hangul syllable is twice the advance of a Latin letter in
 * the same face, so a character count would fit the wrong words.
 */
function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  room: number, size: number, face: string) {
  let px = Math.round(size)
  for (; px > 6; px--) {
    ctx.font = `bold ${px}px ${face}`
    if (ctx.measureText(text).width <= room) break
  }
  ctx.fillText(text, x, y)
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  fill: string, stroke: string, width: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = width
  ctx.stroke()
}

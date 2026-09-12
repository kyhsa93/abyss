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
}

/**
 * A push shorter than this much of the ring is not a push.
 *
 * Without it a thumb resting on the glass walks you into the lake: a finger
 * that is not moving still reports a pixel or two of jitter, and the stick
 * turns any non-zero length into a full-speed unit vector.
 */
const DEADZONE = 0.24

/** Five, as before.  One action is one slot; the shape is there for the rest. */
const MAX_SLOTS = 5

export function layoutFor(w: number, h: number): Layout {
  const small = Math.min(w, h)
  // Bigger than the old game's, which had five buttons to fit on one screen
  // and a fixed logical canvas to fit them in.  These are real pixels on a
  // real phone, and 58 across is about the smallest thing a thumb hits without
  // aiming.
  const btnR = clamp(small * 0.075, 26, 40)
  const base = clamp(small * 0.14, 54, 92)
  const btnX = w - btnR - 18
  const gap = btnR * 2.25
  const row = gap * 0.87
  const bottom = h - btnR - 26
  return {
    base, knob: base * 0.42,
    home: { x: base + 26, y: h - base - 26 },
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
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function hasTouch(): boolean {
  return typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0
}

/** What one slot looks like this frame. */
export type Slot = { label: string; ready: boolean }

export function touchpad(canvas: HTMLCanvasElement, count: number) {
  const slots = Math.min(count, MAX_SLOTS)
  // The same stack the page uses, read once rather than written twice: a
  // canvas font falls back on its own, and a Latin-first list draws 대화 in
  // whichever Hangul font the machine happens to have first.
  const face = getComputedStyle(document.documentElement)
    .getPropertyValue('--mono').trim() || 'monospace'
  let on = hasTouch()
  let busy = false

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

  /** Fingers that landed on nothing: one of them steers, two of them pinch. */
  const free = new Map<number, Push>()
  let pinchGap = 0
  let scale = 1
  let tap: Push | null = null

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
    tap = p

    if (busy) return
    const l = layout()
    const slot = hit(p, l)
    if (slot !== null) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      onButton.set(e.pointerId, slot)
      // An edge, not a held state: one press fires one action however many
      // frames the finger stays down for.
      if (!pressed.has(slot)) { pressed.add(slot); queued.push(slot) }
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

  function up(e: PointerEvent) {
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
      release()
    },

    draw(ctx: CanvasRenderingContext2D, bar: Slot[]) {
      if (!on || busy) return
      const l = layout()

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
        ctx.fillStyle = s.ready ? '#e8e4d8' : 'rgba(232,228,216,.35)'
        ctx.font = `bold ${Math.round(l.btnR * 0.44)}px ${face}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(s.label, b.x, b.y + 1)
      }
    },
  }
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

import { L } from './render/theme'
import { stickToWorld } from './render/camera'
import type { PlayerInput } from './sim/types'

export interface JoystickView {
  originX: number
  originY: number
  knobX: number
  knobY: number
}

/**
 * Keyboard plus touch.
 *
 * Ability presses are queued as edges rather than sampled as held state, so a
 * press fires exactly one ability regardless of framerate. Touch uses pointer
 * events with explicit ids so the stick and a button can be held at once.
 */
export class Input {
  private held = new Set<string>()
  private queued: number[] = []
  /** Raid-cooldown slot asked for since the last tick, if any. */
  private queuedCall: number | null = null
  private restartRequested = false
  private menuRequested = false
  private muteRequested = false
  private auto = readAuto()
  // Detected up front, not on first touch: otherwise a phone shows no controls
  // at all until the player happens to poke the screen.
  private touchMode = hasTouch()

  private joyPointer: number | null = null
  private joyOriginX: number = L.joyHomeX
  private joyOriginY: number = L.joyHomeY
  private joyKnobX: number = L.joyHomeX
  private joyKnobY: number = L.joyHomeY

  /** pointerId -> action bar slot, so releasing the right finger clears it. */
  private buttonPointers = new Map<number, number>()
  private pressedSlots = new Set<number>()

  /** In menu mode the stick and ability buttons are inert. */
  private menuMode = false
  private tapPoint: { x: number; y: number } | null = null

  /**
   * Screen regions the stick must not take, beyond the ones it already tests
   * for itself.
   *
   * The stick used to live in the left half of the screen and everything else
   * lived on the right, so the only thing it could steal was a button it
   * checked first. Now it answers anywhere, which means the corner button and
   * the end-of-fight overlay have to be named. They are handed in each frame
   * rather than imported, because the HUD already imports this file and the
   * cycle would be the only thing gained.
   */
  private reserved: { x: number; y: number; w: number; h: number }[] = []

  constructor(target: Window, canvas: HTMLCanvasElement) {
    target.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase()
      if (MOVE_KEYS.has(key) || ABILITY_KEYS.has(key) || key === 'r') e.preventDefault()
      if (CALL_KEYS.includes(key)) e.preventDefault()
      if (e.repeat) return

      // Any keyboard use hides the touch overlay again.
      this.touchMode = false
      this.held.add(key)

      const slot = ABILITY_KEYS.get(key)
      if (slot !== undefined) this.queued.push(slot)
      // One row further right than the rotation, and off it: a raid cooldown
      // pressed by a finger reaching for its own ability is a raid cooldown
      // wasted, and the whole value of these is in not wasting them.
      const call = CALL_KEYS.indexOf(key)
      if (call >= 0) this.queuedCall = call
      if (key === 'r') this.restartRequested = true
      if (key === 'escape' || key === 'p') this.menuRequested = true
      if (key === 'm') this.muteRequested = true
    })

    target.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()))
    // Dropping held keys on blur avoids the classic "stuck running" bug.
    target.addEventListener('blur', () => this.held.clear())

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e, canvas))
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e, canvas))
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e))
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e))
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** Maps a pointer event onto the canvas's own coordinate space. */
  private toCanvas(e: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * L.w,
      y: ((e.clientY - rect.top) / rect.height) * L.h,
    }
  }

  private onPointerDown(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = this.toCanvas(e, canvas)

    if (e.pointerType === 'touch') this.touchMode = true
    this.tapPoint = { x: p.x, y: p.y }

    if (this.menuMode) return

    // The autocast toggle is checked before the rotation buttons: it sits
    // above them and a thumb that lands on it wanted it.
    if (this.touchMode && Math.hypot(p.x - L.autoPos.x, p.y - L.autoPos.y) <= L.autoR * 1.3) {
      e.preventDefault()
      this.setAuto(!this.auto)
      return
    }

    const slot = hitButton(p.x, p.y)
    if (slot !== null) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      this.buttonPointers.set(e.pointerId, slot)
      if (!this.pressedSlots.has(slot)) {
        this.pressedSlots.add(slot)
        this.queued.push(slot)
      }
      return
    }

    if (this.freeGround(p.x, p.y) && this.joyPointer === null) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      this.joyPointer = e.pointerId
      // Relocate the stick under the finger that grabbed it.
      this.joyOriginX = p.x
      this.joyOriginY = p.y
      this.joyKnobX = p.x
      this.joyKnobY = p.y
    }
  }

  /** Whether a press here belongs to the stick rather than to a control. */
  private freeGround(x: number, y: number): boolean {
    for (const r of this.reserved) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return false
    }
    return true
  }

  /** Called each frame with whatever the fight is currently showing. */
  setReserved(rects: { x: number; y: number; w: number; h: number }[]): void {
    this.reserved = rects
  }

  private onPointerMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.pointerId !== this.joyPointer) return
    e.preventDefault()
    const p = this.toCanvas(e, canvas)
    this.joyKnobX = p.x
    this.joyKnobY = p.y
  }

  private onPointerUp(e: PointerEvent): void {
    const slot = this.buttonPointers.get(e.pointerId)
    if (slot !== undefined) {
      this.buttonPointers.delete(e.pointerId)
      // Only clear the latch once no finger is left on that button.
      if (![...this.buttonPointers.values()].includes(slot)) this.pressedSlots.delete(slot)
      return
    }

    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null
      this.recentre()
    }
  }

  /** The raid-cooldown slot asked for, cleared by the reading. */
  takeCall(): number | null {
    const call = this.queuedCall
    this.queuedCall = null
    return call
  }

  /** A tap on the call row, which only the frame knows the geometry of. */
  requestCall(slot: number): void {
    this.queuedCall = slot
  }

  /** Consumes and returns the input for one simulation tick. */
  consume(): PlayerInput {
    let moveX = 0
    let moveY = 0

    if (this.held.has('a') || this.held.has('q') || this.held.has('arrowleft')) moveX -= 1
    if (this.held.has('d') || this.held.has('e') || this.held.has('arrowright')) moveX += 1
    if (this.held.has('w') || this.held.has('arrowup')) moveY -= 1
    if (this.held.has('s') || this.held.has('arrowdown')) moveY += 1

    if (this.joyPointer !== null) {
      const dx = this.joyKnobX - this.joyOriginX
      const dy = this.joyKnobY - this.joyOriginY
      const len = Math.hypot(dx, dy)
      if (len > L.joyBase * L.joyDeadzone) {
        moveX += dx / len
        moveY += dy / len
      }
    }

    const pressed = this.queued
    this.queued = []
    // Both of those were read on the glass — a key labelled up and a stick
    // pushed up mean up on the screen, whichever way the world is turned
    // underneath. The simulation is owed a world-space vector, so the turn is
    // undone here.
    //
    // Here rather than in `step`, and that is the whole reason a camera can
    // exist at all. What the fight receives is the same world-space push it
    // has always received, so a recorded input replays into the same fight no
    // matter where the camera was pointed when it was made. A camera that
    // reached inside the tick would have to be recorded with it.
    const world = stickToWorld(moveX, moveY)
    return { moveX: world.x, moveY: world.y, pressed }
  }

  /** Stick position for rendering, clamped to the base ring. */
  joystick(): JoystickView | null {
    if (!this.touchMode) return null

    const dx = this.joyKnobX - this.joyOriginX
    const dy = this.joyKnobY - this.joyOriginY
    const len = Math.hypot(dx, dy)
    const clamp = len > L.joyBase ? L.joyBase / len : 1

    return {
      originX: this.joyOriginX,
      originY: this.joyOriginY,
      knobX: this.joyOriginX + dx * clamp,
      knobY: this.joyOriginY + dy * clamp,
    }
  }

  isTouchMode(): boolean {
    return this.touchMode
  }

  /** Menus need raw taps, not steering. */
  setMenuMode(on: boolean): void {
    if (this.menuMode === on) return
    this.menuMode = on
    this.joyPointer = null
    this.buttonPointers.clear()
    this.pressedSlots.clear()
    this.queued.length = 0
    this.recentre()
  }

  /** Consumes the last tap position, in canvas coordinates. */
  takeTapPoint(): { x: number; y: number } | null {
    const p = this.tapPoint
    this.tapPoint = null
    return p
  }

  /** Parks the stick at its home position; call after a resize. */
  recentre(): void {
    if (this.joyPointer !== null) return
    this.joyOriginX = L.joyHomeX
    this.joyOriginY = L.joyHomeY
    this.joyKnobX = L.joyHomeX
    this.joyKnobY = L.joyHomeY
  }

  heldSlots(): ReadonlySet<number> {
    return this.pressedSlots
  }

  /** Whether the rotation is being pressed for the player. */
  isAuto(): boolean {
    return this.auto
  }

  setAuto(on: boolean): void {
    this.auto = on
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0')
    } catch {
      // Private browsing is not worth failing over.
    }
  }

  takeMuteRequest(): boolean {
    const value = this.muteRequested
    this.muteRequested = false
    return value
  }

  /** Escape or P: back to party selection. */
  takeMenuRequest(): boolean {
    const value = this.menuRequested
    this.menuRequested = false
    return value
  }

  takeRestart(): boolean {
    const value = this.restartRequested
    this.restartRequested = false
    return value
  }

}

/**
 * Everything that steers.
 *
 * `q` and `e` strafe alongside `a` and `d`. The game this apes puts turning
 * on those two, but there is no facing here — a token slides in the direction
 * you push it — so the pair that reads as "sideways" is worth having on the
 * hand that is already there.
 */
const MOVE_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'q',
  'e',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
])
/**
 * Five action slots: a protection warrior fills all of them, and a class with
 * fewer simply leaves the tail empty.
 */
export const BAR_SLOTS = 5
/**
 * The call row, in order.
 *
 * Nine of them because a twenty-five-player roster can field all nine
 * classes, and they run rightwards from the rotation so the two never share a
 * finger.
 */
const CALL_KEYS = ['6', '7', '8', '9', '0', '-', '=', '[', ']']

const ABILITY_KEYS = new Map(
  Array.from({ length: BAR_SLOTS }, (_, i) => [String(i + 1), i] as const),
)

/**
 * Nearest button, not the first one that fits.
 *
 * The hit radius is wider than the buttons are, so that a thumb landing beside
 * one still counts — and once they were gathered into a corner cluster those
 * radii started to overlap each other. Taking the first match meant the
 * lowest-numbered button won every shared pixel, so slot one ate the edge of
 * its neighbours. Nearest puts the boundary halfway between them, which is
 * where a person would expect it.
 */
function hitButton(x: number, y: number): number | null {
  let best: number | null = null
  let bestGap = Infinity
  for (let i = 0; i < BAR_SLOTS && i < L.btnPos.length; i++) {
    const b = L.btnPos[i]!
    const gap = Math.hypot(x - b.x, y - b.y)
    if (gap <= L.btnHit && gap < bestGap) {
      bestGap = gap
      best = i
    }
  }
  return best
}

const AUTO_KEY = 'abyss.autocast'

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}

function hasTouch(): boolean {
  if (typeof navigator === 'undefined') return false
  const points = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints
  return typeof points === 'number' && points > 0
}

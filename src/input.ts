import { L } from './render/theme'
import { PLAYER_BAR } from './sim/abilities'
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
  private restartRequested = false
  private tapped = false
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

  constructor(target: Window, canvas: HTMLCanvasElement) {
    target.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase()
      if (MOVE_KEYS.has(key) || ABILITY_KEYS.has(key) || key === 'r') e.preventDefault()
      if (e.repeat) return

      // Any keyboard use hides the touch overlay again.
      this.touchMode = false
      this.held.add(key)

      const slot = ABILITY_KEYS.get(key)
      if (slot !== undefined) this.queued.push(slot)
      if (key === 'r') this.restartRequested = true
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
    this.tapped = true

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

    if (p.x <= L.joyZoneMaxX && this.joyPointer === null) {
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

  /** Consumes and returns the input for one simulation tick. */
  consume(): PlayerInput {
    let moveX = 0
    let moveY = 0

    if (this.held.has('a') || this.held.has('arrowleft')) moveX -= 1
    if (this.held.has('d') || this.held.has('arrowright')) moveX += 1
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
    return { moveX, moveY, pressed }
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

  takeRestart(): boolean {
    const value = this.restartRequested
    this.restartRequested = false
    return value
  }

  /** Any tap, used to retry from the end-of-fight overlay without a keyboard. */
  takeTap(): boolean {
    const value = this.tapped
    this.tapped = false
    return value
  }
}

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
const ABILITY_KEYS = new Map(PLAYER_BAR.map((_, i) => [String(i + 1), i]))

function hitButton(x: number, y: number): number | null {
  for (let i = 0; i < PLAYER_BAR.length && i < L.btnYs.length; i++) {
    const by = L.btnYs[i]!
    if (Math.hypot(x - L.btnX, y - by) <= L.btnHit) return i
  }
  return null
}

function hasTouch(): boolean {
  if (typeof navigator === 'undefined') return false
  const points = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints
  return typeof points === 'number' && points > 0
}

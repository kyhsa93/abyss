import { Input } from '../src/input'
import { CANVAS_H, CANVAS_W, JOYSTICK, TOUCH_BUTTONS } from '../src/render/theme'

/**
 * Touch input runs through a canvas that is letterboxed to fit the viewport,
 * so every pointer position has to be mapped back into canvas space. This
 * exercises that mapping at a deliberately awkward scale and offset.
 */
const RECT = { left: 37, top: 91, width: CANVAS_W * 0.42, height: CANVAS_H * 0.42 }

type Listener = (e: unknown) => void
const listeners = new Map<string, Listener[]>()

function on(type: string, fn: Listener): void {
  const list = listeners.get(type) ?? []
  list.push(fn)
  listeners.set(type, list)
}

const fakeTarget = { addEventListener: on } as unknown as Window
const fakeCanvas = {
  addEventListener: on,
  getBoundingClientRect: () => RECT,
  setPointerCapture: () => {},
} as unknown as HTMLCanvasElement

const input = new Input(fakeTarget, fakeCanvas)

/** Canvas-space point -> the client coordinates a real browser would report. */
function fire(type: string, canvasX: number, canvasY: number, pointerId: number): void {
  const e = {
    pointerId,
    pointerType: 'touch',
    button: 0,
    clientX: RECT.left + (canvasX / CANVAS_W) * RECT.width,
    clientY: RECT.top + (canvasY / CANVAS_H) * RECT.height,
    preventDefault: () => {},
  }
  for (const fn of listeners.get(type) ?? []) fn(e)
}

let failures = 0
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  -> ${detail}`}`)
}

const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol

// 1. Touching the left half places the stick under the finger, neutral at rest.
fire('pointerdown', 300, 560, 1)
const stick = input.joystick()
check(
  'stick relocates to the touch point',
  stick !== null && near(stick.originX, 300, 1) && near(stick.originY, 560, 1),
  JSON.stringify(stick),
)
let move = input.consume()
check('no drift inside the deadzone', move.moveX === 0 && move.moveY === 0, JSON.stringify(move))

// 2. Dragging right produces a right-facing unit vector.
fire('pointermove', 300 + JOYSTICK.baseRadius, 560, 1)
move = input.consume()
check('drag right moves right', near(move.moveX, 1) && near(move.moveY, 0), JSON.stringify(move))

// 3. The knob is clamped to the base ring even when the finger runs past it.
fire('pointermove', 300 + JOYSTICK.baseRadius * 4, 560, 1)
const clamped = input.joystick()!
check(
  'knob clamps to the ring',
  near(Math.hypot(clamped.knobX - clamped.originX, clamped.knobY - clamped.originY), JOYSTICK.baseRadius, 0.5),
  JSON.stringify(clamped),
)

// 4. A second finger on an ability button fires it without disturbing movement.
fire('pointerdown', TOUCH_BUTTONS.x, TOUCH_BUTTONS.ys[1]!, 2)
move = input.consume()
check('button press queues its slot', move.pressed.join(',') === '1', JSON.stringify(move.pressed))
check('movement survives the second finger', near(move.moveX, 1), JSON.stringify(move))
check('held slot is reported for rendering', input.heldSlots().has(1), [...input.heldSlots()].join(','))

// 5. Holding the button does not autofire.
move = input.consume()
check('held button does not repeat', move.pressed.length === 0, JSON.stringify(move.pressed))

// 6. Releasing clears the latch so it can fire again.
fire('pointerup', TOUCH_BUTTONS.x, TOUCH_BUTTONS.ys[1]!, 2)
check('latch clears on release', !input.heldSlots().has(1), [...input.heldSlots()].join(','))
fire('pointerdown', TOUCH_BUTTONS.x, TOUCH_BUTTONS.ys[1]!, 3)
move = input.consume()
check('button fires again after release', move.pressed.join(',') === '1', JSON.stringify(move.pressed))

// 7. Releasing the stick stops the player.
fire('pointerup', 0, 0, 1)
move = input.consume()
check('release stops movement', move.moveX === 0 && move.moveY === 0, JSON.stringify(move))

// 8. Taps on the right half must not steer.
fire('pointerdown', CANVAS_W - 40, 200, 4)
move = input.consume()
check('right half does not steer', move.moveX === 0 && move.moveY === 0, JSON.stringify(move))

if (failures > 0) throw new Error(`${failures} touch check(s) failed`)
console.log('all touch checks passed')

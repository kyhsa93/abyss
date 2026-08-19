import { Input } from '../src/input'
import { L, updateLayout } from '../src/render/theme'

/** A portrait phone: the case where the controls were unreachable before. */
const VIEW = { w: 390, h: 844 }
updateLayout(VIEW.w, VIEW.h)

// The canvas now fills the viewport, but device pixel ratio and browser chrome
// still mean client coordinates are not canvas coordinates.
const RECT = { left: 0, top: 0, width: VIEW.w, height: VIEW.h }

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
    clientX: RECT.left + (canvasX / L.w) * RECT.width,
    clientY: RECT.top + (canvasY / L.h) * RECT.height,
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
fire('pointerdown', 120, 700, 1)
const stick = input.joystick()
check(
  'stick relocates to the touch point',
  stick !== null && near(stick.originX, 120, 1) && near(stick.originY, 700, 1),
  JSON.stringify(stick),
)
let move = input.consume()
check('no drift inside the deadzone', move.moveX === 0 && move.moveY === 0, JSON.stringify(move))

// 2. Dragging right produces a right-facing unit vector.
fire('pointermove', 120 + L.joyBase, 700, 1)
move = input.consume()
check('drag right moves right', near(move.moveX, 1) && near(move.moveY, 0), JSON.stringify(move))

// 3. The knob is clamped to the base ring even when the finger runs past it.
fire('pointermove', 120 + L.joyBase * 4, 700, 1)
const clamped = input.joystick()!
check(
  'knob clamps to the ring',
  near(Math.hypot(clamped.knobX - clamped.originX, clamped.knobY - clamped.originY), L.joyBase, 0.5),
  JSON.stringify(clamped),
)

// 4. A second finger on an ability button fires it without disturbing movement.
fire('pointerdown', L.btnPos[1]!.x, L.btnPos[1]!.y, 2)
move = input.consume()
check('button press queues its slot', move.pressed.join(',') === '1', JSON.stringify(move.pressed))
check('movement survives the second finger', near(move.moveX, 1), JSON.stringify(move))
check('held slot is reported for rendering', input.heldSlots().has(1), [...input.heldSlots()].join(','))

// 5. Holding the button does not autofire.
move = input.consume()
check('held button does not repeat', move.pressed.length === 0, JSON.stringify(move.pressed))

// 6. Releasing clears the latch so it can fire again.
fire('pointerup', L.btnPos[1]!.x, L.btnPos[1]!.y, 2)
check('latch clears on release', !input.heldSlots().has(1), [...input.heldSlots()].join(','))
fire('pointerdown', L.btnPos[1]!.x, L.btnPos[1]!.y, 3)
move = input.consume()
check('button fires again after release', move.pressed.join(',') === '1', JSON.stringify(move.pressed))

// 7. Releasing the stick stops the player.
fire('pointerup', 0, 0, 1)
move = input.consume()
check('release stops movement', move.moveX === 0 && move.moveY === 0, JSON.stringify(move))

// 8. Taps on the right half must not steer.
fire('pointerdown', L.w - 20, 200, 4)
move = input.consume()
check('right half does not steer', move.moveX === 0 && move.moveY === 0, JSON.stringify(move))

// 9. Every control must sit inside the viewport, in both orientations. This
// is the regression that made the joystick unreachable: a letterboxed canvas
// put the controls outside the element that receives touches.
for (const [label, w, h] of [
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
  ['small portrait 360x640', 360, 640],
  ['desktop 1440x900', 1440, 900],
] as const) {
  updateLayout(w, h)
  const inside =
    L.joyHomeX - L.joyBase >= 0 &&
    L.joyHomeY + L.joyBase <= h &&
    L.btnPos.every(
      (b) =>
        b.x - L.btnR >= 0 && b.x + L.btnR <= w && b.y - L.btnR >= 0 && b.y + L.btnR <= h,
    )
  const where = L.btnPos.map((b) => `${b.x.toFixed(0)},${b.y.toFixed(0)}`).join(' ')
  check(`${label}: controls fit on screen`, inside, `joy=${L.joyHomeX},${L.joyHomeY} btn=${where}`)

  // Every button, not just the column: the fourth slot sits further left than
  // the rest and is the one that can reach into the steering half.
  const leftmost = Math.min(...L.btnPos.map((b) => b.x - L.btnR))
  check(`${label}: buttons outside the steering half`, leftmost > L.joyZoneMaxX, `${leftmost.toFixed(0)} vs ${L.joyZoneMaxX}`)

  // And no two of them may sit on top of each other, or one is unpressable.
  const collisions = L.btnPos.flatMap((a, i) =>
    L.btnPos.slice(i + 1).filter((b) => Math.hypot(a.x - b.x, a.y - b.y) < L.btnR * 2),
  )
  check(`${label}: ${L.btnPos.length} buttons do not overlap`, collisions.length === 0, where)

  // The camera follows the player, so the arena is no longer pinned anywhere
  // and "does the floor fit" is not the question any more. What has to hold
  // is that the player's own token is drawn at the middle of the viewport,
  // clear of both the top band and the thumbs.
  const centred = L.cx === w / 2 && L.cy === h / 2
  check(`${label}: the player is pinned to the middle of the screen`, centred, `${L.cx},${L.cy} of ${w}x${h}`)

  // Nothing may sit on top of the player's own token, and there has to be
  // room above it for the banner that hangs off the top band.
  const nearestButton = Math.min(
    ...L.btnPos.map((b) => Math.hypot(b.x - L.cx, b.y - L.cy) - L.btnR),
  )
  const stickGap = Math.hypot(L.joyHomeX - L.cx, L.joyHomeY - L.cy) - L.joyBase
  const clearOfControls =
    nearestButton > 24 && stickGap > 24 && L.cy > L.bannerY + 24 && L.arenaR > 60
  check(
    `${label}: nothing is drawn on top of the pin`,
    clearOfControls,
    `button ${nearestButton.toFixed(0)}px, stick ${stickGap.toFixed(0)}px, banner ${(L.cy - L.bannerY).toFixed(0)}px`,
  )
}

if (failures > 0) throw new Error(`${failures} touch check(s) failed`)
console.log('all touch checks passed')

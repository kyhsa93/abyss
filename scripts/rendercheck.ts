import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { drawWorld } from '../src/render/draw'
import { drawHud } from '../src/render/hud'

/** Records every 2D context call so the render path can run outside a browser. */
function stubCtx(): CanvasRenderingContext2D {
  const noop = () => {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'canvas') return { width: 960, height: 760 }
      return noop
    },
    set() {
      return true
    },
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
}

function touchView(active: boolean) {
  return {
    active,
    joystick: active
      ? { originX: 128, originY: 628, knobX: 160, knobY: 600 }
      : null,
    heldSlots: new Set<number>(active ? [1] : []),
  }
}

const ctx = stubCtx()
let frames = 0
for (const attempt of [0, 5]) {
  const s = createState(0x51ed, attempt)
  const rng = new Rng(0x51ed + attempt * 7919)
  while (s.outcome === 'ongoing' && s.time < 200) {
    step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
    drawWorld(ctx, s, 0.5, s.time)
    // Alternate modes so both the desktop bar and the touch overlay are drawn.
    drawHud(ctx, s, touchView(s.tick % 2 === 0))
    frames++
  }
  // Also render the terminal state, which draws the outcome overlay.
  drawWorld(ctx, s, 1, s.time)
  drawHud(ctx, s, touchView(true))
  drawHud(ctx, s, touchView(false))
  console.log(`attempt ${attempt}: ${s.outcome} at ${s.time.toFixed(1)}s`)
}
console.log(`rendered ${frames} frames with no exceptions`)

import type { PlayerInput } from './sim/types'

/**
 * Keyboard state. Ability presses are queued as edges rather than sampled as
 * held keys, so one keypress fires exactly one ability regardless of framerate.
 */
export class Input {
  private held = new Set<string>()
  private queued: number[] = []
  private restartRequested = false

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase()
      if (
        ['w', 'a', 's', 'd', '1', '2', '3', 'r', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
      ) {
        e.preventDefault()
      }
      if (e.repeat) return

      this.held.add(key)
      if (key === '1') this.queued.push(0)
      if (key === '2') this.queued.push(1)
      if (key === '3') this.queued.push(2)
      if (key === 'r') this.restartRequested = true
    })

    target.addEventListener('keyup', (e) => {
      this.held.delete(e.key.toLowerCase())
    })

    // Dropping held keys on blur avoids the classic "stuck running" bug.
    target.addEventListener('blur', () => {
      this.held.clear()
    })
  }

  /** Consumes and returns the input for one simulation tick. */
  consume(): PlayerInput {
    let moveX = 0
    let moveY = 0
    if (this.held.has('a') || this.held.has('arrowleft')) moveX -= 1
    if (this.held.has('d') || this.held.has('arrowright')) moveX += 1
    if (this.held.has('w') || this.held.has('arrowup')) moveY -= 1
    if (this.held.has('s') || this.held.has('arrowdown')) moveY += 1

    const pressed = this.queued
    this.queued = []
    return { moveX, moveY, pressed }
  }

  takeRestart(): boolean {
    const value = this.restartRequested
    this.restartRequested = false
    return value
  }
}

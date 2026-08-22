import { NAME_MAX, cleanName } from '../name'
import { COLORS } from './theme'

/**
 * The one place this game asks for text.
 *
 * Everything else here is a canvas and a thumb, and a canvas cannot be typed
 * into: on a phone there is no keyboard without a focused form element, so an
 * on-canvas field would be a field only a desktop could use. A real `input`,
 * laid over the row it belongs to and taken away again the moment it is done,
 * is the whole of it — the native keyboard, the native caret, and the paste
 * menu, none of which are worth reimplementing badly.
 *
 * It is deliberately not left in the page. A stray focused input under a
 * canvas swallows the keys the fight is played with.
 */

interface Editing {
  field: HTMLInputElement
  done: (value: string | null) => void
}

let editing: Editing | null = null

export function isEditingName(): boolean {
  return editing !== null
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Opens the field over `box`, in page coordinates.
 *
 * The canvas is sized to the viewport in CSS pixels and the layout is
 * computed in the same units, so a rectangle from the layout is already where
 * the element goes — no mapping, and nothing to drift out of step when the
 * window is resized.
 */
export function editName(box: Box, current: string, done: (value: string | null) => void): void {
  if (editing) close(null)

  const field = document.createElement('input')
  field.type = 'text'
  field.value = current
  field.maxLength = NAME_MAX
  field.autocomplete = 'off'
  field.spellcheck = false
  field.setAttribute('aria-label', 'Your name')
  Object.assign(field.style, {
    position: 'fixed',
    left: `${Math.round(box.x)}px`,
    top: `${Math.round(box.y)}px`,
    width: `${Math.round(box.w)}px`,
    height: `${Math.round(box.h)}px`,
    boxSizing: 'border-box',
    padding: '0 10px',
    background: COLORS.panel,
    color: COLORS.text,
    border: `2px solid ${COLORS.castBar}`,
    borderRadius: '0',
    font: 'bold 15px ui-monospace, monospace',
    textAlign: 'center',
    outline: 'none',
  })

  field.addEventListener('keydown', (event) => {
    // Stopped here rather than let through: the fight listens on the window,
    // and typing a name should not also be pressing ability slots.
    event.stopPropagation()
    if (event.key === 'Enter') close(field.value)
    if (event.key === 'Escape') close(null)
  })
  field.addEventListener('blur', () => close(field.value))

  document.body.appendChild(field)
  editing = { field, done }

  // Focused after it is in the page, and selected so that the first key
  // replaces the old name rather than appending to it.
  field.focus()
  field.select()
}

function close(value: string | null): void {
  const open = editing
  if (!open) return
  editing = null
  open.field.remove()
  open.done(value === null ? null : cleanName(value))
}

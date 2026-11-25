/**
 * features/reconstruction/dndSensors.ts
 * Sensors for dragging reconstruction cards between columns.
 *
 * Mouse drags start after a short move, as before. Touch drags need a long press, so a plain
 * swipe over a card scrolls the page and never moves the card to another column.
 */
import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'

export const TOUCH_DRAG_DELAY_MS = 250

/** Lets the browser pan and scroll over a card; the touch sensor blocks scrolling only once a drag is active. */
export const DRAGGABLE_TOUCH_ACTION = 'manipulation'

export function useReconstructionSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: 5 } }),
  )
}

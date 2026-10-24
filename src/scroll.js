/**
 * Touch and wheel scroll ownership for the terminal screen.
 *
 * Why this exists: xterm's scrolling element (`.xterm-viewport`) and its
 * drawing element (`.xterm-screen`) are siblings. A finger swiping over the
 * text has no scrollable ancestor under it, so the browser scrolls the page
 * instead of the terminal — the single most visible mobile defect of the stock
 * screen.
 *
 * Two modes:
 * - `terminal` (default): the screen owns the gesture. Touch is `touch-action:
 *   none`; touchmove/wheel are consumed (preventDefault + stopPropagation) and
 *   translated into `scrollLines` calls with a pixel remainder and a short
 *   inertia tail.
 * - `page`: the page owns the gesture. Touch is `touch-action: pan-y`; the
 *   handlers still stop propagation in the capture phase but deliberately do
 *   NOT preventDefault, because xterm's own wheel listener calls
 *   preventDefault and would otherwise freeze the page.
 *
 * @module scroll
 */

const LINE_HEIGHT_FALLBACK = 17
const INERTIA_DECAY = 0.92
const INERTIA_MIN_VELOCITY = 0.05

/**
 * Attach scroll ownership to a screen node.
 * @param {object} options
 * @param {HTMLElement} options.node - the element that receives the gestures.
 * @param {() => 'terminal' | 'page'} options.mode - current scroll mode.
 * @param {() => { scrollLines: (amount: number) => void, scrollToBottom?: () => void } | undefined} options.target
 *   - the emulator facade whose line count is driven.
 * @param {() => number} options.lineHeight - measured row height in px.
 * @param {() => boolean} [options.canScroll] - whether the gesture applies now.
 * @param {() => boolean} [options.paused] - whether a long-press selection owns
 *   the current gesture; while it does, the screen neither scrolls nor claims
 *   the touchmove, leaving the selection module to extend the highlight.
 * @returns {{ dispose: () => void }}
 */
export function installScrollOwnership(options) {
  const { node, mode, target, lineHeight, canScroll, paused } = options
  const isPaused = () => paused !== undefined && paused()
  let active = null
  let remainder = 0
  let inertiaFrame = 0
  let velocity = 0

  const rowHeight = () => {
    const measured = lineHeight()
    return Number.isFinite(measured) && measured > 0 ? measured : LINE_HEIGHT_FALLBACK
  }

  const scrollByPixels = (pixels) => {
    const emulator = target()
    if (emulator === undefined) return
    if (pixels === 0) return
    // Accumulate the fractional row so a slow drag still moves the screen; the
    // remainder is kept in pixels, not rows, so it survives a line-height
    // change (font size) without drifting.
    remainder += pixels
    const rows = Math.trunc(remainder / rowHeight())
    if (rows === 0) return
    remainder -= rows * rowHeight()
    emulator.scrollLines(rows)
  }

  const stopInertia = () => {
    if (inertiaFrame !== 0) {
      cancelAnimationFrame(inertiaFrame)
      inertiaFrame = 0
    }
    velocity = 0
  }

  const runInertia = () => {
    inertiaFrame = 0
    if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) {
      velocity = 0
      return
    }
    scrollByPixels(velocity)
    velocity *= INERTIA_DECAY
    inertiaFrame = requestAnimationFrame(runInertia)
  }

  const startInertia = () => {
    if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) return
    if (inertiaFrame !== 0) cancelAnimationFrame(inertiaFrame)
    inertiaFrame = requestAnimationFrame(runInertia)
  }

  const onTouchStart = (event) => {
    stopInertia()
    remainder = 0
    const touch = event.touches[0]
    active = touch === undefined ? null : { y: touch.clientY, at: event.timeStamp }
    // The gesture is classified here, once, for the whole sequence: whichever
    // mode is active must keep xterm from also reacting to the same contact.
    event.stopPropagation()
    if (mode() !== 'terminal') return
    if (event.cancelable) event.preventDefault()
  }

  const onTouchMove = (event) => {
    // Capture-phase stopPropagation in BOTH modes: in `page` mode the browser
    // still scrolls (no preventDefault), but xterm's own handlers stay out.
    event.stopPropagation()
    // A claimed long-press selection extends the highlight instead of moving
    // the buffer; the selection module consumes the event itself.
    if (isPaused()) return
    if (mode() !== 'terminal') return
    if (canScroll !== undefined && !canScroll()) return
    const touch = event.touches[0]
    if (touch === undefined || active === null) return
    const delta = active.y - touch.clientY
    active = { y: touch.clientY, at: event.timeStamp }
    if (event.cancelable) event.preventDefault()
    scrollByPixels(delta)
    // Track a decaying finger velocity for the inertia tail.
    velocity = delta * 0.6 + velocity * 0.4
  }

  const onTouchEnd = (event) => {
    active = null
    event.stopPropagation()
    // A selection drag ends on the same touch; dropping the claimed flag here
    // hands the next gesture back to scrolling.
    if (isPaused()) return
    if (mode() !== 'terminal') return
    if (event.cancelable) event.preventDefault()
    startInertia()
  }

  const onWheel = (event) => {
    if (mode() !== 'terminal') {
      // Capture-phase stopPropagation keeps xterm's preventDefault from
      // freezing the page, while leaving the browser's own scroll intact.
      event.stopPropagation()
      return
    }
    if (canScroll !== undefined && !canScroll()) return
    if (event.deltaY === 0) return
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
    stopInertia()
    // Wheel deltas are already in pixels for the common trackpad case; a line
    // delta is converted with the measured row height.
    const pixels = event.deltaMode === 1 ? event.deltaY * rowHeight() : event.deltaY
    scrollByPixels(pixels)
  }

  node.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
  node.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  node.addEventListener('touchend', onTouchEnd, { passive: false, capture: true })
  node.addEventListener('touchcancel', onTouchEnd, { passive: false, capture: true })
  node.addEventListener('wheel', onWheel, { passive: false, capture: true })

  return {
    dispose() {
      stopInertia()
      node.removeEventListener('touchstart', onTouchStart, { capture: true })
      node.removeEventListener('touchmove', onTouchMove, { capture: true })
      node.removeEventListener('touchend', onTouchEnd, { capture: true })
      node.removeEventListener('touchcancel', onTouchEnd, { capture: true })
      node.removeEventListener('wheel', onWheel, { capture: true })
    },
  }
}

/**
 * Whether a node can host a terminal scroll gesture right now.
 * @param {HTMLElement | null} node - the screen element.
 * @returns {boolean}
 */
export function screenHasSize(node) {
  return node !== null && node.clientWidth > 0 && node.clientHeight > 0
}

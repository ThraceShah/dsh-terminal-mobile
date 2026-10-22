/**
 * Visual-viewport keyboard inset.
 *
 * A mobile soft keyboard shrinks the *visual* viewport while the *layout*
 * viewport keeps its height, so anything anchored to the bottom of the layout
 * viewport (our key bar, and the terminal above it) ends up behind the
 * keyboard. The fix is to publish the occluded height as a CSS variable and let
 * the root consume it as bottom padding:
 *
 *     inset = max(0, innerHeight - (visualViewport.offsetTop + visualViewport.height))
 *
 * @module viewport
 */

/** CSS variable carrying the occluded height in pixels. */
export const KEYBOARD_INSET_VARIABLE = '--dsh-tm-keyboard-inset'

/**
 * Current occluded height, in CSS pixels.
 * @returns {number} 0 when nothing is occluded (or there is no visual viewport).
 */
export function measureKeyboardInset() {
  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
  if (viewport === undefined || viewport === null) return 0
  const occluded = window.innerHeight - (viewport.offsetTop + viewport.height)
  return occluded > 0 ? Math.round(occluded) : 0
}

/**
 * Observe the visual viewport and write the inset onto an element.
 * @param {HTMLElement | null} element - the element receiving the variable.
 * @param {() => void} [onChange] - called whenever the measured inset changes.
 * @returns {{ dispose: () => void, measure: () => number }}
 */
export function installKeyboardInset(element, onChange) {
  let published = -1

  const update = () => {
    const inset = measureKeyboardInset()
    if (element !== null) element.style.setProperty(KEYBOARD_INSET_VARIABLE, `${inset}px`)
    if (inset !== published) {
      published = inset
      onChange?.()
    }
  }

  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)
  update()

  return {
    measure: measureKeyboardInset,
    dispose() {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      element?.style.removeProperty(KEYBOARD_INSET_VARIABLE)
    },
  }
}

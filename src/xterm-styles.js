/**
 * xterm.js stylesheet installation.
 *
 * xterm renders its DOM assuming `@xterm/xterm/css/xterm.css` is present: the
 * viewport is absolutely positioned over the screen, the helper textarea is
 * pushed off-screen, the rows are laid out by cell metrics. Without it the
 * emulator still runs but every pointer coordinate maps to the wrong cell
 * (clicks land one row off, the top row looks duplicated) and the viewport
 * reports a zero scroll height.
 *
 * The official terminal package gets this stylesheet from the host's global
 * CSS pipeline. A self-bundled plugin has no such pipeline, so the build
 * inlines the file into the bundle and this module injects it exactly once,
 * before any Terminal is opened.
 *
 * @module xterm-styles
 */

/** Marker used to find (and never duplicate) the installed tag. */
export const STYLE_ATTRIBUTE = 'data-dsh-terminal-mobile-xterm-css'

/**
 * Install the inlined stylesheet once per document.
 * @param {string} css - stylesheet text supplied by the build's define.
 * @returns {boolean} whether a tag was created by this call.
 */
export function installXtermStyles(css) {
  if (typeof document === 'undefined') return false
  if (typeof css !== 'string' || css === '') return false
  if (document.querySelector(`style[${STYLE_ATTRIBUTE}]`) !== null) return false
  const tag = document.createElement('style')
  tag.setAttribute(STYLE_ATTRIBUTE, '')
  tag.textContent = css
  document.head.appendChild(tag)
  return true
}

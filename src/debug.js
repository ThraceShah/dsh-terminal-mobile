/**
 * Optional frame capture for field diagnosis.
 *
 * Disabled by default. With `localStorage['dsh.terminal-mobile.debug'] = '1'`
 * the screen keeps a bounded ring of the frames it received and exposes them on
 * `window.__dshTerminalMobileCapture`, which is the difference between "the
 * shell printed garbage" (upstream bytes) and "our screen mis-rendered them".
 *
 * @module debug
 */

const DEBUG_KEY = 'dsh.terminal-mobile.debug'

/** Capture handle installed on the window when debugging is on. */
const CAPTURE_GLOBAL = '__dshTerminalMobileCapture'

/** Whether the debug switch is on. */
export function debugEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Create a bounded capture sink.
 * @param {number} limit - frames retained.
 * @returns {{ push: (entry: object) => void, clear: () => void, enabled: boolean, frames: object[] }}
 */
export function createFrameCapture(limit = 200) {
  const frames = []
  const enabled = debugEnabled()
  const capture = {
    enabled,
    frames,
    clear() {
      frames.length = 0
    },
    push(entry) {
      if (!enabled) return
      frames.push({ at: Date.now(), ...entry })
      if (frames.length > limit) frames.splice(0, frames.length - limit)
    },
  }
  if (enabled && typeof window !== 'undefined') window[CAPTURE_GLOBAL] = capture
  return capture
}

/**
 * Observable preference state and sticky-modifier state.
 *
 * Both live in one module singleton for the whole browser session: font size,
 * scroll mode and the key bar are shared by every terminal tab and every
 * session (a phone user tunes the screen once), and the sticky flags survive a
 * tab switch the way a hardware modifier key would.
 *
 * Arrow-function methods keep `this` when a store method is destructured.
 *
 * @module ui-state
 */
import { applySticky, defaultSettings, loadSettings, saveSettings } from './settings.js'

/**
 * A tiny external store: `getSnapshot` returns a stable reference between
 * mutations, which is exactly what `useSyncExternalStore` requires.
 */
export class ObservableState {
  /** @param {object} initial */
  constructor(initial) {
    this.current = initial
    this.listeners = new Set()
  }

  /** @returns {object} the current immutable snapshot. */
  getSnapshot = () => this.current

  /**
   * @param {() => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Replace the snapshot and notify; equal references are a no-op. */
  set = (next) => {
    if (next === this.current) return
    this.current = next
    for (const listener of [...this.listeners]) listener()
  }
}

/** Persisted preferences. */
export const preferences = new ObservableState(loadSettings())

/** Sticky Ctrl/Alt arming state; never persisted. */
export const sticky = new ObservableState({ ctrl: false, alt: false })

function commit(settings) {
  preferences.set(settings)
  saveSettings(settings)
}

/** Change the terminal font size (clamped by the normalizer on read). */
export function setFontSize(fontSize) {
  const next = { ...preferences.getSnapshot(), fontSize }
  commit(next)
  return next
}

/** Switch between scrolling the terminal and scrolling the page. */
export function setScrollMode(scrollMode) {
  const next = { ...preferences.getSnapshot(), scrollMode: scrollMode === 'page' ? 'page' : 'terminal' }
  commit(next)
  return next
}

/** Show or hide the extension key bar. */
export function setKeyBarEnabled(enabled) {
  const current = preferences.getSnapshot()
  const next = { ...current, keyBar: { ...current.keyBar, enabled: Boolean(enabled) } }
  commit(next)
  return next
}

/** Replace the visible builtin key list. */
export function setBuiltinKeys(keys) {
  const current = preferences.getSnapshot()
  const next = { ...current, keyBar: { ...current.keyBar, keys: [...keys] } }
  commit(next)
  return next
}

/** Replace the custom key list. */
export function setCustomKeys(custom) {
  const current = preferences.getSnapshot()
  const next = { ...current, keyBar: { ...current.keyBar, custom: [...custom] } }
  commit(next)
  return next
}

/** Reset every preference to the shipped defaults. */
export function resetPreferences() {
  commit(defaultSettings())
}

/** Toggle one sticky modifier. */
export function toggleSticky(modifier) {
  const current = sticky.getSnapshot()
  sticky.set({ ...current, [modifier]: !current[modifier] })
}

/** Disarm every sticky modifier. */
export function clearSticky() {
  const current = sticky.getSnapshot()
  if (!current.ctrl && !current.alt) return
  sticky.set({ ctrl: false, alt: false })
}

/**
 * Consume the armed modifiers against one payload.
 * @param {string} payload - bytes of the pressed key.
 * @returns {string} bytes to write; the sticky flags are updated in place.
 */
export function consumeSticky(payload) {
  const armed = sticky.getSnapshot()
  if (!armed.ctrl && !armed.alt) return payload
  const result = applySticky(payload, armed)
  if (result.sticky.ctrl !== armed.ctrl || result.sticky.alt !== armed.alt) {
    sticky.set({ ctrl: Boolean(result.sticky.ctrl), alt: Boolean(result.sticky.alt) })
  }
  return result.data
}

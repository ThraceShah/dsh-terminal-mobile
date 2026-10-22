/**
 * Soft-keyboard gating and screen focus.
 *
 * The screen's helper textarea is what the browser uses to summon the soft
 * keyboard, and xterm rewrites `readOnly` whenever `disableStdin` changes. The
 * plugin therefore owns one explicit gate:
 *
 * - `gated` — the user has not asked for the soft keyboard (the default).
 * - `locked` — the terminal model is not writable (read-only page, reconnecting).
 *
 * Either condition makes the textarea read-only and sets `inputmode=none`, so a
 * tap on the screen neither summons a keyboard nor swallows the tap. Hardware
 * keys still work: xterm's keydown path is independent of `readOnly`.
 *
 * @module gate
 */

/**
 * Apply the gate to an opened terminal.
 * @param {import('@xterm/xterm').Terminal | undefined} terminal - the emulator.
 * @param {boolean} gated - whether the soft keyboard is being withheld.
 * @param {boolean} locked - whether the terminal is not writable.
 */
export function applySoftKeyboardGate(terminal, gated, locked) {
  const textarea = terminal?.textarea
  if (textarea === undefined || textarea === null) return
  const readOnly = gated || locked
  if (textarea.readOnly !== readOnly) textarea.readOnly = readOnly
  const mode = readOnly ? 'none' : 'text'
  if (textarea.getAttribute('inputmode') !== mode) textarea.setAttribute('inputmode', mode)
}

/**
 * Move focus to the screen so hardware keys and IME keep working.
 * Never called from a data-write path — only from an explicit user gesture on
 * the key bar or a tap on the screen.
 * @param {import('@xterm/xterm').Terminal | undefined} terminal - the emulator.
 */
export function focusScreen(terminal) {
  try {
    terminal?.focus()
  } catch {
    /* A disposed emulator throws; focus is best-effort. */
  }
}

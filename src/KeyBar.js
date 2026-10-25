/**
 * The Termux-style extension key bar.
 *
 * Layout rules that matter on a phone:
 * - It is a flex row that WRAPS. A horizontal scroller would hide the keys a
 *   user just added off-screen — with a hidden scrollbar that reads as "my
 *   configuration disappeared".
 * - Height is capped (~40vh) with vertical scrolling, so a bar with many rows
 *   can never push the screen out of the viewport.
 * - Keys use `pointerdown` with `preventDefault()` so the press never moves
 *   focus away from the key editor while it is open, and never starts a text
 *   selection drag.
 *
 * @module KeyBar
 */
import * as React from 'react'
import { builtinKeyBytes, isModifierKey } from './settings.js'
import { builtinAriaLabel, builtinLabel, customAriaLabel, customLabel } from './labels.js'

/**
 * Render the bar.
 *
 * The editor entry does NOT live here: at the end of the last key row it sat
 * where a thumb reaching for keys would miss it, and its icon doubled the
 * toolbar's own keyboard toggle. It moved to the toolbar — see `Toolbar`.
 *
 * @param {object} props
 * @param {(key: string) => string} props.t - namespace-bound translate.
 * @param {object} props.prefs - current preferences.
 * @param {object} props.ui - the injected ui-state module.
 * @param {(payload: string) => void} props.onKey - send decoded bytes.
 */
export function KeyBar({ t, prefs, ui, onKey }) {
  const sticky = ui.sticky
  const armed = React.useSyncExternalStore(sticky.subscribe, sticky.getSnapshot, sticky.getSnapshot)

  const press = (event, action) => {
    // Pointerdown, not click: the focus change a click causes would leave the
    // key editor's input mid-edit, and iOS would drop the gesture.
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  const buttons = []
  for (const id of prefs.keyBar.keys) {
    if (isModifierKey(id)) {
      const modifier = id === 'ctrl' ? 'ctrl' : 'alt'
      buttons.push(
        React.createElement(
          'button',
          {
            key: `builtin-${id}`,
            type: 'button',
            className: 'dsh-tm-key',
            'aria-label': builtinLabel(t, id),
            'aria-pressed': armed[modifier],
            'data-terminal-mobile-key': id,
            onPointerDown: (event) => press(event, () => ui.toggleSticky(modifier)),
            onClick: (event) => event.preventDefault(),
          },
          builtinLabel(t, id),
        ),
      )
      continue
    }
    const bytes = builtinKeyBytes(id)
    if (bytes === undefined) continue
    buttons.push(
      React.createElement(
        'button',
        {
          key: `builtin-${id}`,
          type: 'button',
          className: 'dsh-tm-key',
          'aria-label': builtinAriaLabel(t, id),
          'data-terminal-mobile-key': id,
          onPointerDown: (event) => press(event, () => onKey(bytes)),
          onClick: (event) => event.preventDefault(),
        },
        builtinLabel(t, id),
      ),
    )
  }

  for (const entry of prefs.keyBar.custom) {
    buttons.push(
      React.createElement(
        'button',
        {
          key: `custom-${entry.id}`,
          type: 'button',
          className: 'dsh-tm-key',
          'aria-label': customAriaLabel(entry),
          'aria-pressed': entry.modifier === undefined ? undefined : armed[entry.modifier],
          'data-terminal-mobile-custom-key': entry.id,
          onPointerDown: (event) =>
            press(event, () => {
              if (entry.modifier !== undefined) ui.toggleSticky(entry.modifier)
              else onKey(entry.send)
            }),
          onClick: (event) => event.preventDefault(),
        },
        customLabel(entry),
      ),
    )
  }

  return React.createElement(
    'div',
    { className: 'dsh-tm-keybar', role: 'group', 'aria-label': t('bar.label'), 'data-terminal-mobile-keybar': true },
    buttons,
  )
}

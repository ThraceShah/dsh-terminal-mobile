/**
 * The extension key editor.
 *
 * Two sections in one dialog:
 * - built-in keys: a checkbox per id, checked keys appear in the bar in the
 *   order they are checked (so the order is editable by unchecking and
 *   re-checking);
 * - custom keys: label + escape payload + optional modifier role.
 *
 * Every edit is committed immediately (there is no Cancel button), which is
 * what makes "my key disappeared" impossible: the bar behind the dialog already
 * shows the result, and a half-filled row is persisted as-is rather than
 * dropped.
 *
 * @module KeyEditor
 */
import * as React from 'react'
import { Button, Checkbox, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'

import { BUILTIN_KEY_IDS, isModifierKey } from './settings.js'
import { decodeEscapes, encodeEscapes } from './escape.js'
import { builtinLabel } from './labels.js'

let nextCustomId = 0

function createCustomId() {
  nextCustomId += 1
  return `custom-${Date.now().toString(36)}-${nextCustomId}`
}

/**
 * Render the editor dialog.
 * @param {object} props
 * @param {(key: string) => string} props.t - namespace-bound translate.
 * @param {object} props.ui - the injected ui-state module.
 * @param {() => void} props.onClose - dismiss the dialog.
 */
export function KeyEditor({ t, ui, onClose }) {
  const preferences = ui.preferences
  const prefs = React.useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot)
  const keys = prefs.keyBar.keys
  const custom = prefs.keyBar.custom

  const toggleBuiltin = (id) => {
    if (keys.includes(id)) ui.setBuiltinKeys(keys.filter((entry) => entry !== id))
    else ui.setBuiltinKeys([...keys, id])
  }

  const patchCustom = (index, patch) => {
    ui.setCustomKeys(custom.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)))
  }

  const builtinRows = BUILTIN_KEY_IDS.map((id) =>
    React.createElement(Checkbox, {
      key: id,
      checked: keys.includes(id),
      onChange: () => toggleBuiltin(id),
      label: builtinLabel(t, id),
    }),
  )

  const customRows = custom.map((entry, index) =>
    React.createElement(
      'div',
      { className: 'dsh-tm-editor-row', key: entry.id, 'data-terminal-mobile-custom-row': entry.id },
      React.createElement(
        'div',
        { className: 'dsh-tm-editor-inline' },
        React.createElement(Input, {
          value: entry.label,
          maxLength: 24,
          placeholder: t('editor.labelPlaceholder'),
          'aria-label': t('editor.customLabel'),
          onChange: (event) => patchCustom(index, { label: event.target.value }),
        }),
        React.createElement(
          Button,
          {
            variant: 'outline',
            size: 'sm',
            onClick: () => ui.setCustomKeys(custom.filter((_, at) => at !== index)),
          },
          t('editor.customRemove'),
        ),
      ),
      React.createElement(Input, {
        value: encodeEscapes(entry.send),
        placeholder: t('editor.sendPlaceholder'),
        'aria-label': t('editor.sendPlaceholder'),
        onChange: (event) => patchCustom(index, { send: decodeEscapes(event.target.value) }),
      }),
      React.createElement(
        'div',
        { className: 'dsh-tm-editor-inline' },
        React.createElement(
          'select',
          {
            value: entry.modifier ?? '',
            'aria-label': t('editor.customModifier'),
            onChange: (event) => {
              const value = event.target.value
              patchCustom(index, { modifier: value === '' ? undefined : value })
            },
          },
          React.createElement('option', { value: '' }, t('editor.customModifierNone')),
          React.createElement('option', { value: 'ctrl' }, t('modifier.ctrl')),
          React.createElement('option', { value: 'alt' }, t('modifier.alt')),
        ),
      ),
    ),
  )

  const body = React.createElement(
    'div',
    { 'data-terminal-mobile-editor': true },
    React.createElement(
      'div',
      { className: 'dsh-tm-editor-section' },
      React.createElement(Checkbox, {
        checked: prefs.keyBar.enabled,
        onChange: (next) => ui.setKeyBarEnabled(next),
        label: t('editor.showBar'),
      }),
    ),
    React.createElement(
      'div',
      { className: 'dsh-tm-editor-section' },
      React.createElement('h3', { className: 'dsh-tm-editor-heading' }, t('editor.builtin')),
      React.createElement('p', { className: 'dsh-tm-editor-hint' }, t('editor.builtinHint')),
      React.createElement('div', { className: 'dsh-tm-editor-grid' }, builtinRows),
    ),
    React.createElement(
      'div',
      { className: 'dsh-tm-editor-section' },
      React.createElement('h3', { className: 'dsh-tm-editor-heading' }, t('editor.custom')),
      React.createElement('p', { className: 'dsh-tm-editor-hint' }, t('editor.sendHint')),
      custom.length === 0 ? React.createElement('p', { className: 'dsh-tm-editor-hint' }, t('editor.customEmpty')) : customRows,
      React.createElement(
        Button,
        {
          variant: 'outline',
          size: 'sm',
          onClick: () => ui.setCustomKeys([...custom, { id: createCustomId(), label: '', send: '' }]),
        },
        t('editor.customAdd'),
      ),
    ),
  )

  return React.createElement(
    Modal,
    {
      open: true,
      onClose,
      title: t('editor.title'),
      description: t('editor.description'),
      closeLabel: t('editor.close'),
      className: 'dsh-tm-editor-dialog',
      contentClassName: 'dsh-tm-editor-scroll',
      footer: React.createElement(Button, { variant: 'primary', size: 'md', onClick: onClose }, t('editor.done')),
    },
    body,
  )
}

/** Whether a builtin id is a modifier (re-exported for the editor's own tests). */
export { isModifierKey }

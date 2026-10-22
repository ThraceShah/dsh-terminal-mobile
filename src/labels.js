/**
 * Label assembly for the key bar and its editor.
 *
 * The dictionary carries one entry per builtin id (`key.<id>`), so the bar and
 * the editor's checkbox list never drift from the id vocabulary. A custom key
 * uses its own label, falling back to the id when the user left it empty.
 *
 * @module labels
 */
import { builtinKeyBytes, isModifierKey } from './settings.js'

/** Visible label of one builtin key. */
export function builtinLabel(t, id) {
  const text = t(`key.${id}`)
  // `t` returns the key itself when a dictionary misses the entry; showing
  // "key.pipe" would be worse than showing the id.
  return text === `key.${id}` ? id : text
}

/** Visible label of one custom key. */
export function customLabel(entry) {
  if (typeof entry.label === 'string' && entry.label !== '') return entry.label
  if (entry.modifier !== undefined) return entry.modifier === 'ctrl' ? 'Ctrl' : 'Alt'
  if (entry.send !== '') return printableHint(entry.send)
  return entry.id
}

/** Accessible name of one custom key, spelling out what it will send. */
export function customAriaLabel(entry) {
  const label = customLabel(entry)
  if (entry.modifier !== undefined) return label
  return `${label} (${escapeForHint(entry.send)})`
}

/** Accessible name of one builtin key. */
export function builtinAriaLabel(t, id) {
  const label = builtinLabel(t, id)
  if (isModifierKey(id)) return label
  return `${label} (${escapeForHint(builtinKeyBytes(id) ?? '')})`
}

/** A short, readable form of a byte payload for hints and fallbacks. */
export function escapeForHint(data) {
  if (data === '') return ''
  let out = ''
  for (const char of data) {
    const code = char.codePointAt(0)
    if (char === '\x1b') out += '\\e'
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`
    else out += char
  }
  return out
}

function printableHint(data) {
  const hint = escapeForHint(data)
  return hint.length > 12 ? `${hint.slice(0, 11)}…` : hint
}

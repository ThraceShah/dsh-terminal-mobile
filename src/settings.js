/**
 * Pure terminal-mobile settings: schema, normalization, persistence and the
 * Termux-style sticky-modifier byte rules.
 *
 * Nothing here touches the DOM or React. The module is shared by the browser
 * bundle and by the Node-side logic tests, so it must stay free of browser
 * globals except for the guarded `localStorage` access in load/save.
 *
 * @module settings
 */

/** Storage key of every persisted preference of this plugin. */
export const STORAGE_KEY = 'dsh.terminal-mobile.v1'

/** Font size bounds and default, in CSS pixels. */
export const FONT_SIZE_MIN = 9
export const FONT_SIZE_MAX = 28
export const FONT_SIZE_DEFAULT = 13

/** Builtin extension keys, in the order a fresh installation shows them. */
export const DEFAULT_BUILTIN_KEYS = [
  'ctrl',
  'alt',
  'tab',
  'esc',
  'backspace',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pipe',
  'dash',
  'tilde',
]

/**
 * Every builtin key id the editor may offer. The default bar uses a subset;
 * the editor's checkbox list covers all of them, so the ids are a stable
 * vocabulary rather than a snapshot of the default bar.
 */
export const BUILTIN_KEY_IDS = [
  'ctrl',
  'alt',
  'tab',
  'esc',
  'backspace',
  'enter',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pgup',
  'pgdn',
  'del',
  'insert',
  'pipe',
  'dash',
  'tilde',
  'slash',
  'backslash',
  'star',
  'amp',
  'semicolon',
  'quote',
  'dollar',
  'lparen',
  'rparen',
  'lbrace',
  'rbrace',
  'lt',
  'gt',
  'eq',
  'plus',
  'percent',
  'hash',
  'at',
  'bang',
  'caret',
  'question',
  'comma',
  'dot',
  'space',
]

/** Builtin keys that arm a sticky modifier instead of sending bytes. */
const MODIFIER_KEYS = new Set(['ctrl', 'alt'])

/**
 * Byte payload of each builtin key.
 *
 * Arrow/home/end use CSI (`ESC [ A`), the sequence a normal (non-application)
 * cursor mode shell expects; an application-cursor sequence (`ESC O A`) is
 * reachable through a custom key when a full-screen program needs it.
 *
 * Backspace sends DEL (0x7f), not BS (0x08): the DEL byte is what readline,
 * bash and every modern terminal treat as "erase one character".
 */
const BUILTIN_KEY_BYTES = {
  ctrl: '',
  alt: '',
  tab: '\t',
  esc: '\x1b',
  backspace: '\x7f',
  enter: '\r',
  up: '\x1b[A',
  down: '\x1b[B',
  left: '\x1b[D',
  right: '\x1b[C',
  home: '\x1b[H',
  end: '\x1b[F',
  pgup: '\x1b[5~',
  pgdn: '\x1b[6~',
  del: '\x1b[3~',
  insert: '\x1b[2~',
  pipe: '|',
  dash: '-',
  tilde: '~',
  slash: '/',
  backslash: '\\',
  star: '*',
  amp: '&',
  semicolon: ';',
  quote: "'",
  dollar: '$',
  lparen: '(',
  rparen: ')',
  lbrace: '{',
  rbrace: '}',
  lt: '<',
  gt: '>',
  eq: '=',
  plus: '+',
  percent: '%',
  hash: '#',
  at: '@',
  bang: '!',
  caret: '^',
  question: '?',
  comma: ',',
  dot: '.',
  space: ' ',
}

/** Whether a builtin key id is a sticky modifier. */
export function isModifierKey(id) {
  return MODIFIER_KEYS.has(id)
}

/** Bytes a builtin key sends, or undefined for an unknown id. */
export function builtinKeyBytes(id) {
  return BUILTIN_KEY_BYTES[id]
}

/** The complete default settings of a fresh installation. */
export function defaultSettings() {
  return {
    fontSize: FONT_SIZE_DEFAULT,
    scrollMode: 'terminal',
    keyBar: {
      enabled: true,
      keys: [...DEFAULT_BUILTIN_KEYS],
      custom: [],
    },
  }
}

function clampFontSize(value) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return FONT_SIZE_DEFAULT
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(number)))
}

function normalizeCustomKey(raw, index) {
  if (raw === null || typeof raw !== 'object') return undefined
  const label = typeof raw.label === 'string' ? raw.label.slice(0, 24) : ''
  const send = typeof raw.send === 'string' ? raw.send : ''
  const modifier = raw.modifier === 'ctrl' || raw.modifier === 'alt' ? raw.modifier : undefined
  // A half-filled editor row (label typed, send not yet) is a real user intent:
  // keep it as long as ANY field carries something, and drop only a wholly
  // blank row.
  if (label === '' && send === '' && modifier === undefined) return undefined
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : `custom-${index}`
  return modifier === undefined ? { id, label, send } : { id, label, send, modifier }
}

function normalizeBuiltinKeys(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_BUILTIN_KEYS]
  const seen = new Set()
  const keys = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    if (BUILTIN_KEY_BYTES[entry] === undefined) continue
    if (seen.has(entry)) continue
    seen.add(entry)
    keys.push(entry)
  }
  return keys
}

/**
 * Coerce any stored/unknown value into a complete, valid settings object.
 * A malformed package falls back to defaults; an unknown field is dropped.
 */
export function normalizeSettings(raw) {
  const defaults = defaultSettings()
  if (raw === null || typeof raw !== 'object') return defaults
  const keyBar = raw.keyBar !== null && typeof raw.keyBar === 'object' ? raw.keyBar : {}
  const custom = Array.isArray(keyBar.custom)
    ? keyBar.custom.map(normalizeCustomKey).filter((entry) => entry !== undefined)
    : []
  return {
    fontSize: clampFontSize(raw.fontSize ?? defaults.fontSize),
    scrollMode: raw.scrollMode === 'page' ? 'page' : 'terminal',
    keyBar: {
      enabled: typeof keyBar.enabled === 'boolean' ? keyBar.enabled : defaults.keyBar.enabled,
      keys: normalizeBuiltinKeys(keyBar.keys),
      custom,
    },
  }
}

/** Read the persisted settings, or defaults when absent/unreadable. */
export function loadSettings(storage) {
  const store = storage ?? safeStorage()
  if (store === undefined) return defaultSettings()
  try {
    const text = store.getItem(STORAGE_KEY)
    if (text === null || text === '') return defaultSettings()
    return normalizeSettings(JSON.parse(text))
  } catch {
    return defaultSettings()
  }
}

/** Persist the settings; a failed write (private mode, quota) is not fatal. */
export function saveSettings(settings, storage) {
  const store = storage ?? safeStorage()
  if (store === undefined) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* Preferences are a convenience; the terminal must keep working without them. */
  }
}

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined') return undefined
    return localStorage
  } catch {
    return undefined
  }
}

/**
 * Apply sticky modifiers to the bytes of one key press.
 *
 * Termux semantics:
 * - A multi-character payload that is not an ESC sequence is a paste/IME
 *   insert: it is sent verbatim and consumes nothing.
 * - Ctrl maps a single character to its C0 byte. A MULTI-character ESC
 *   sequence is already a control sequence and its bytes are left alone — but
 *   the modifier is still consumed, because the user's key press happened.
 * - Alt prefixes ESC, and is applied last so Ctrl+Alt produces ESC + C0.
 *
 * @returns the bytes to write plus the sticky flags left armed.
 */
export function applySticky(payload, sticky) {
  if (payload.length === 0) return { data: payload, sticky }
  if (payload.length > 1 && !payload.startsWith('\x1b')) return { data: payload, sticky }
  let data = payload
  const next = { ...sticky }
  if (next.ctrl) {
    // A multi-byte ESC sequence is already control data: keep its bytes, but
    // still consume the armed modifier (a press was made and answered).
    if (!(data.length > 1 && data.startsWith('\x1b'))) data = controlByte(data)
    delete next.ctrl
  }
  if (next.alt) {
    data = `\x1b${data}`
    delete next.alt
  }
  return { data, sticky: next }
}

/** Map one character to its C0 control byte (Ctrl+key semantics). */
export function controlByte(data) {
  if (data.length !== 1) return data
  const code = data.charCodeAt(0)
  if (code >= 0x61 && code <= 0x7a) return String.fromCharCode(code - 0x60)
  if (code >= 0x41 && code <= 0x5a) return String.fromCharCode(code - 0x40)
  if (code === 0x40 || code === 0x20) return '\x00'
  if (code >= 0x5b && code <= 0x5f) return String.fromCharCode(code - 0x40)
  if (code === 0x3f) return '\x7f'
  return data
}

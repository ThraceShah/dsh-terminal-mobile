/**
 * Pure-logic test: settings normalization, sticky byte rules, escape codec,
 * labels and the xterm-styles installer. These run against the SOURCES (no DOM
 * needed) and are the fastest signal when a byte contract drifts.
 */
import { createSuite } from './harness.mjs'
import {
  BUILTIN_KEY_IDS,
  DEFAULT_BUILTIN_KEYS,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  STORAGE_KEY,
  applySticky,
  builtinKeyBytes,
  controlByte,
  defaultSettings,
  isModifierKey,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from '../src/settings.js'
import { decodeEscapes, encodeEscapes } from '../src/escape.js'
import { builtinLabel, customAriaLabel, customLabel, escapeForHint } from '../src/labels.js'
import { installXtermStyles } from '../src/xterm-styles.js'

const suite = createSuite('logic')

// ── defaults ──────────────────────────────────────────────────────────────────
const defaults = defaultSettings()
suite.equal('default font size', defaults.fontSize, 13)
suite.equal('default scroll mode', defaults.scrollMode, 'terminal')
suite.equal('default key bar is on', defaults.keyBar.enabled, true)
suite.equal('default builtin keys', defaults.keyBar.keys, DEFAULT_BUILTIN_KEYS)
suite.equal('default custom keys empty', defaults.keyBar.custom, [])
suite.check('default bar starts with the modifiers', DEFAULT_BUILTIN_KEYS[0] === 'ctrl' && DEFAULT_BUILTIN_KEYS[1] === 'alt')
suite.check('default bar includes Bksp', DEFAULT_BUILTIN_KEYS.includes('backspace'))
suite.check('every default key has bytes or is a modifier', DEFAULT_BUILTIN_KEYS.every((id) => isModifierKey(id) || builtinKeyBytes(id) !== undefined))
suite.check('every builtin id has bytes or is a modifier', BUILTIN_KEY_IDS.every((id) => isModifierKey(id) || builtinKeyBytes(id) !== undefined))
suite.equal('no duplicate builtin ids', BUILTIN_KEY_IDS.length, new Set(BUILTIN_KEY_IDS).size)

// ── byte contract ─────────────────────────────────────────────────────────────
suite.equal('backspace is DEL', builtinKeyBytes('backspace'), '\x7f')
suite.check('backspace is not BS', builtinKeyBytes('backspace') !== '\b')
suite.equal('tab is HT', builtinKeyBytes('tab'), '\t')
suite.equal('esc is ESC', builtinKeyBytes('esc'), '\x1b')
suite.equal('up is CSI A', builtinKeyBytes('up'), '\x1b[A')
suite.equal('down is CSI B', builtinKeyBytes('down'), '\x1b[B')
suite.equal('right is CSI C', builtinKeyBytes('right'), '\x1b[C')
suite.equal('left is CSI D', builtinKeyBytes('left'), '\x1b[D')
suite.equal('home is CSI H', builtinKeyBytes('home'), '\x1b[H')
suite.equal('end is CSI F', builtinKeyBytes('end'), '\x1b[F')
suite.equal('pipe byte', builtinKeyBytes('pipe'), '|')
suite.equal('dash byte', builtinKeyBytes('dash'), '-')
suite.equal('tilde byte', builtinKeyBytes('tilde'), '~')
suite.equal('modifiers send nothing', builtinKeyBytes('ctrl'), '')
suite.check('ctrl/alt are modifiers', isModifierKey('ctrl') && isModifierKey('alt'))
suite.check('a normal key is not a modifier', !isModifierKey('up'))

// ── font size clamp ───────────────────────────────────────────────────────────
suite.equal('font size clamps high', normalizeSettings({ fontSize: 99 }).fontSize, FONT_SIZE_MAX)
suite.equal('font size clamps low', normalizeSettings({ fontSize: -4 }).fontSize, FONT_SIZE_MIN)
suite.equal('font size rounds', normalizeSettings({ fontSize: 13.6 }).fontSize, 14)
suite.equal('font size rejects NaN', normalizeSettings({ fontSize: 'abc' }).fontSize, FONT_SIZE_DEFAULT)
suite.equal('font size rejects Infinity', normalizeSettings({ fontSize: Infinity }).fontSize, FONT_SIZE_DEFAULT)
suite.equal('font size accepts a numeric string', normalizeSettings({ fontSize: '16' }).fontSize, 16)

// ── normalization ─────────────────────────────────────────────────────────────
suite.equal('garbage falls back to defaults', normalizeSettings('nope').fontSize, FONT_SIZE_DEFAULT)
suite.equal('null falls back to defaults', normalizeSettings(null).scrollMode, 'terminal')
suite.equal('unknown scroll mode falls back', normalizeSettings({ scrollMode: 'sideways' }).scrollMode, 'terminal')
suite.equal('page scroll mode is kept', normalizeSettings({ scrollMode: 'page' }).scrollMode, 'page')
suite.equal('unknown builtin ids are dropped', normalizeSettings({ keyBar: { keys: ['ctrl', 'nope', 'tab'] } }).keyBar.keys, ['ctrl', 'tab'])
suite.equal('duplicate builtin ids collapse', normalizeSettings({ keyBar: { keys: ['tab', 'tab'] } }).keyBar.keys, ['tab'])
suite.equal('a non-array key list falls back to defaults', normalizeSettings({ keyBar: { keys: 'ctrl' } }).keyBar.keys, DEFAULT_BUILTIN_KEYS)
suite.equal('an empty key list stays empty', normalizeSettings({ keyBar: { keys: [] } }).keyBar.keys, [])

// Half-filled custom rows are a real intent and must survive a reload.
const halfFilled = normalizeSettings({
  keyBar: {
    custom: [
      { id: 'a', label: 'Home', send: '' },
      { id: 'b', label: '', send: '\x1b[H' },
      { id: 'c', label: '', send: '', modifier: 'ctrl' },
      { id: 'd', label: '', send: '' },
      { id: 'e', label: 'x'.repeat(40), send: 'y' },
    ],
  },
})
suite.equal('half-filled custom rows survive', halfFilled.keyBar.custom.length, 4)
suite.equal('the blank row is dropped', halfFilled.keyBar.custom.map((entry) => entry.id), ['a', 'b', 'c', 'e'])
suite.equal('labels are capped at 24 chars', halfFilled.keyBar.custom[3].label.length, 24)
suite.equal('the modifier role survives', halfFilled.keyBar.custom[2].modifier, 'ctrl')
suite.check('a row without an id still gets one', normalizeSettings({ keyBar: { custom: [{ label: 'x', send: 'y' }] } }).keyBar.custom[0].id !== '')
suite.equal('non-object custom rows are dropped', normalizeSettings({ keyBar: { custom: [null, 3, 'x'] } }).keyBar.custom.length, 0)
suite.equal('unknown custom modifier is dropped', normalizeSettings({ keyBar: { custom: [{ label: 'x', send: 'y', modifier: 'shift' }] } }).keyBar.custom[0].modifier, undefined)
suite.equal('unknown fields are ignored', normalizeSettings({ fontSize: 15, mystery: 1 }).mystery, undefined)

// ── persistence ───────────────────────────────────────────────────────────────
function memoryStorage(initial) {
  const map = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]])
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    map,
  }
}

const storage = memoryStorage()
saveSettings({ ...defaultSettings(), fontSize: 20 }, storage)
suite.equal('saved under the documented key', [...storage.map.keys()], [STORAGE_KEY])
suite.equal('round-trips through storage', loadSettings(storage).fontSize, 20)
suite.equal('a corrupt payload falls back to defaults', loadSettings(memoryStorage('{oops')).fontSize, FONT_SIZE_DEFAULT)
suite.equal('an empty payload falls back to defaults', loadSettings(memoryStorage('')).fontSize, FONT_SIZE_DEFAULT)
suite.equal('a missing payload falls back to defaults', loadSettings(memoryStorage()).fontSize, FONT_SIZE_DEFAULT)
const throwing = {
  getItem() {
    throw new Error('denied')
  },
  setItem() {
    throw new Error('denied')
  },
}
suite.equal('a throwing storage still yields defaults', loadSettings(throwing).fontSize, FONT_SIZE_DEFAULT)
suite.check('a throwing storage is not fatal on save', (() => {
  saveSettings(defaultSettings(), throwing)
  return true
})())

// ── sticky modifiers ──────────────────────────────────────────────────────────
suite.equal('plain key without sticky', applySticky('a', {}).data, 'a')
suite.equal('ctrl maps to C0', applySticky('a', { ctrl: true }).data, '\x01')
suite.equal('ctrl maps uppercase', applySticky('A', { ctrl: true }).data, '\x01')
suite.equal('ctrl maps c', applySticky('c', { ctrl: true }).data, '\x03')
suite.equal('ctrl maps space to NUL', applySticky(' ', { ctrl: true }).data, '\x00')
suite.equal('ctrl maps @ to NUL', applySticky('@', { ctrl: true }).data, '\x00')
suite.equal('ctrl maps [ to ESC', applySticky('[', { ctrl: true }).data, '\x1b')
suite.equal('ctrl maps ? to DEL', applySticky('?', { ctrl: true }).data, '\x7f')
suite.equal('alt prefixes ESC', applySticky('a', { alt: true }).data, '\x1ba')
suite.equal('ctrl+alt applies alt last', applySticky('a', { ctrl: true, alt: true }).data, '\x1b\x01')
suite.check('a consumed ctrl disarms', applySticky('a', { ctrl: true }).sticky.ctrl !== true)
suite.check('a consumed alt disarms', applySticky('a', { alt: true }).sticky.alt !== true)
suite.check('both consumed disarm both', Object.keys(applySticky('a', { ctrl: true, alt: true }).sticky).length === 0)

// A paste/IME payload is multi-character and not an ESC sequence: send it as-is
// and leave the modifiers armed, exactly like Termux.
const pasted = applySticky('hello world', { ctrl: true, alt: true })
suite.equal('multi-char payload is sent verbatim', pasted.data, 'hello world')
suite.check('multi-char payload keeps sticky armed', pasted.sticky.ctrl === true && pasted.sticky.alt === true)

// An ESC sequence is already a control sequence: Ctrl must not mangle its
// bytes, but the press still consumes the armed modifier.
const arrow = applySticky('\x1b[A', { ctrl: true })
suite.equal('ctrl leaves ESC sequences alone', arrow.data, '\x1b[A')
suite.check('ctrl is consumed by an ESC sequence', arrow.sticky.ctrl !== true)
suite.equal('ctrl+esc sends a bare ESC', applySticky('\x1b', { ctrl: true }).data, '\x1b')
suite.check('ctrl is consumed by a bare ESC', applySticky('\x1b', { ctrl: true }).sticky.ctrl !== true)
suite.equal('alt still prefixes an ESC sequence', applySticky('\x1b[A', { alt: true }).data, '\x1b\x1b[A')
suite.equal('empty payload is a no-op', applySticky('', { ctrl: true }).data, '')
suite.check('empty payload keeps sticky armed', applySticky('', { ctrl: true }).sticky.ctrl === true)

// controlByte edge cases
suite.equal('controlByte of a digit is unchanged', controlByte('5'), '5')
suite.equal('controlByte of a multi-char string is unchanged', controlByte('ab'), 'ab')

// ── escape codec ──────────────────────────────────────────────────────────────
const roundTrips = ['', 'a', '\x1b[A', '\x1b[H', '\x7f', '\r', '\n', '\t', '\x00', '\x01', 'hello', '中文']
for (const value of roundTrips) {
  suite.equal(`escape round-trips ${JSON.stringify(value)}`, decodeEscapes(encodeEscapes(value)), value)
}
suite.equal('decodes \\e', decodeEscapes('\\e'), '\x1b')
suite.equal('decodes \\xHH', decodeEscapes('\\x7f'), '\x7f')
suite.equal('decodes \\uHHHH', decodeEscapes('\\u4f60'), '你')
suite.equal('decodes \\n \\r \\t', decodeEscapes('\\n\\r\\t'), '\n\r\t')
suite.equal('decodes \\0', decodeEscapes('\\0'), '\x00')
suite.equal('decodes a literal backslash', decodeEscapes('\\\\'), '\\')
suite.equal('unknown escapes keep the backslash', decodeEscapes('\\d'), '\\d')
suite.equal('a trailing backslash survives', decodeEscapes('abc\\'), 'abc\\')
suite.equal('a malformed hex escape stays literal', decodeEscapes('\\xZZ'), '\\xZZ')
suite.equal('a short hex escape stays literal', decodeEscapes('\\x7'), '\\x7')
suite.equal('an ESC sequence decodes whole', decodeEscapes('\\e[A'), '\x1b[A')
suite.equal('encodes ESC as \\e', encodeEscapes('\x1b'), '\\e')
suite.equal('encodes DEL as \\x7f', encodeEscapes('\x7f'), '\\x7f')

// ── labels ────────────────────────────────────────────────────────────────────
const t = (key) => ({ 'key.ctrl': 'Ctrl', 'key.backspace': 'Bksp', 'key.up': '↑' })[key] ?? key
suite.equal('builtin label resolves', builtinLabel(t, 'ctrl'), 'Ctrl')
suite.equal('Bksp label is ASCII', builtinLabel(t, 'backspace'), 'Bksp')
suite.check('Bksp label has no ⌫ glyph', !builtinLabel(t, 'backspace').includes('⌫'))
suite.equal('a missing key label falls back to the id', builtinLabel(t, 'pipe'), 'pipe')
suite.equal('a custom label wins', customLabel({ id: 'x', label: 'Home', send: '\x1b[H' }), 'Home')
suite.equal('an empty custom label falls back to its payload', customLabel({ id: 'x', label: '', send: '\x1b[H' }), '\\e[H')
suite.equal('a custom modifier shows its role', customLabel({ id: 'x', label: '', send: '', modifier: 'ctrl' }), 'Ctrl')
suite.check('a custom aria label names the payload', customAriaLabel({ id: 'x', label: 'Home', send: '\x1b[H' }).includes('\\e[H'))
suite.equal('escapeForHint shows control bytes', escapeForHint('\x1b[A'), '\\e[A')
suite.equal('escapeForHint keeps printable text', escapeForHint('|'), '|')

// ── stylesheet installer ──────────────────────────────────────────────────────
const installed = []
const fakeDocument = {
  querySelector: (selector) => (installed.some((tag) => selector.includes(tag.attribute)) ? {} : null),
  createElement: () => {
    const tag = {
      attribute: undefined,
      textContent: '',
      setAttribute(name) {
        tag.attribute = name
      },
    }
    return tag
  },
  head: { appendChild: (tag) => installed.push(tag) },
}
const previousDocument = globalThis.document
globalThis.document = fakeDocument
suite.check('installs the stylesheet once', installXtermStyles('.xterm{}') === true)
suite.check('a second install is a no-op', installXtermStyles('.xterm{}') === false)
suite.check('an empty stylesheet is ignored', installXtermStyles('') === false)
suite.equal('only one tag was created', installed.length, 1)
globalThis.document = previousDocument

suite.finish()

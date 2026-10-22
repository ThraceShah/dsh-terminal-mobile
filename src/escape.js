/**
 * C-style escape encoding for custom key payloads.
 *
 * The key editor shows a human-readable escape string (`\e[A`, `\x7f`,
 * `\u4f60`) and stores decoded bytes. Decoding is deliberately forgiving: an
 * unknown `\X` keeps its literal backslash so a user typing `\d` sees `\d`,
 * never a silent truncation.
 *
 * @module escape
 */

const SIMPLE_ESCAPES = {
  n: '\n',
  r: '\r',
  t: '\t',
  e: '\x1b',
  a: '\x07',
  b: '\b',
  f: '\f',
  v: '\v',
  0: '\x00',
  '\\': '\\',
}

/**
 * Decode an escape string into the bytes it names.
 * @param {string} text - the editor text.
 * @returns {string} decoded payload.
 */
export function decodeEscapes(text) {
  if (typeof text !== 'string' || text === '') return ''
  let out = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char !== '\\' || index === text.length - 1) {
      out += char
      continue
    }
    const next = text[index + 1]
    if (Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, next)) {
      out += SIMPLE_ESCAPES[next]
      index += 1
      continue
    }
    if (next === 'x') {
      const hex = text.slice(index + 2, index + 4)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16))
        index += 3
        continue
      }
    }
    if (next === 'u') {
      const hex = text.slice(index + 2, index + 6)
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16))
        index += 5
        continue
      }
    }
    // Unknown escape: keep the backslash so nothing is silently dropped.
    out += char
  }
  return out
}

/**
 * Encode bytes back into the editor's escape syntax.
 * @param {string} data - decoded payload.
 * @returns {string} editor text.
 */
export function encodeEscapes(data) {
  if (typeof data !== 'string' || data === '') return ''
  let out = ''
  for (const char of data) {
    const code = char.codePointAt(0)
    if (char === '\\') out += '\\\\'
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (char === '\x1b') out += '\\e'
    else if (char === '\x07') out += '\\a'
    else if (char === '\b') out += '\\b'
    else if (char === '\f') out += '\\f'
    else if (char === '\v') out += '\\v'
    else if (char === '\x00') out += '\\0'
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`
    else out += char
  }
  return out
}

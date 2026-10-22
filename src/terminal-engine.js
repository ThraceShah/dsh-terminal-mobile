/**
 * Terminal colour plumbing ported from the official sidebar terminal so the
 * screen keeps matching the application theme:
 *
 * - {@link TerminalTheme} keeps DSH defaults (background/foreground/cursor from
 *   the resolved palette) separate from program colour overrides, so an OSC 4 /
 *   OSC 10-12 / OSC 104 / OSC 110-112 sequence is honoured and a reset returns
 *   to the theme rather than to xterm's black.
 * - {@link observeTerminalCursor} repaints the DOM cursor with a colour that
 *   stays legible on default, indexed, true-colour and inverse cell
 *   backgrounds, because xterm's cursor colour is a palette entry, not a
 *   contrast calculation.
 *
 * @module terminal-engine
 */

const ANSI_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
]

const SPECIAL_KEYS = ['foreground', 'background', 'cursor']

/** DSH palette applied to one xterm screen, with program overrides on top. */
export class TerminalTheme {
  /**
   * @param {import('@xterm/xterm').Terminal} terminal - an opened emulator.
   */
  constructor(terminal) {
    this.terminal = terminal
    this.defaults = {}
    this.indexed = new Map()
    this.special = new Map()
    const observe = (code, change) =>
      terminal.parser.registerOscHandler(code, (data) => {
        change(data)
        // Returning false lets xterm keep its own colour handling: this class
        // only remembers what the program asked for so a reset can restore the
        // theme defaults instead of xterm's built-in black.
        return false
      })
    this.subscriptions = [
      observe(4, (data) => {
        const parts = data.split(';')
        for (let index = 0; index + 1 < parts.length; index += 2) {
          const indexValue = colorIndex(parts[index])
          const color = oscColor(parts[index + 1])
          if (indexValue !== undefined && color !== undefined) this.indexed.set(indexValue, color)
        }
      }),
      observe(104, (data) => {
        if (data === '') this.indexed.clear()
        else {
          for (const part of data.split(';')) {
            const indexValue = colorIndex(part)
            if (indexValue !== undefined) this.indexed.delete(indexValue)
          }
        }
        this.apply()
      }),
      ...SPECIAL_KEYS.flatMap((key, offset) => [
        observe(10 + offset, (data) => {
          const parts = data.split(';')
          for (let index = 0; index < parts.length; index += 1) {
            const target = SPECIAL_KEYS[offset + index]
            const color = oscColor(parts[index])
            if (target !== undefined && color !== undefined) this.special.set(target, color)
          }
        }),
        observe(110 + offset, () => {
          this.special.delete(key)
          this.apply()
        }),
      ]),
    ]
  }

  /**
   * Apply the current DSH colours without replacing program palette entries.
   * @param {string} background - resolved opaque background colour.
   * @param {string} foreground - resolved text colour.
   */
  update(background, foreground) {
    if (this.defaults.background === background && this.defaults.foreground === foreground) return
    this.defaults = {
      background,
      foreground,
      cursor: foreground,
      cursorAccent: background,
      selectionBackground: foreground,
      selectionForeground: background,
      selectionInactiveBackground: foreground,
    }
    this.apply()
  }

  /** Cursor colour preferred by the theme or by the program (OSC 12). */
  get cursor() {
    return this.special.get('cursor') ?? this.defaults.cursor
  }

  /** Drop parser observers before the emulator is disposed. */
  dispose() {
    for (const subscription of this.subscriptions) subscription.dispose()
  }

  apply() {
    const theme = { ...this.defaults, ...Object.fromEntries(this.special) }
    for (const [index, color] of this.indexed) {
      if (index < ANSI_KEYS.length) theme[ANSI_KEYS[index]] = color
      else (theme.extendedAnsi ??= [])[index - ANSI_KEYS.length] = color
    }
    this.terminal.options.theme = theme
  }
}

/**
 * Keep the DOM cursor visible over any cell background.
 * @param {import('@xterm/xterm').Terminal} terminal - opened DOM emulator.
 * @param {HTMLElement} node - screen root owning the cursor CSS variables.
 * @param {() => string | undefined} preferredCursor - current preferred colour.
 * @returns {{ dispose: () => void }} listener disposer.
 */
export function observeTerminalCursor(terminal, node, preferredCursor) {
  return terminal.onRender(() => {
    const cursor = node.querySelector('.xterm-cursor')
    if (cursor === null) return
    // The cursor element carries the cell's background as its own background,
    // which is exactly what a "readable ink on this cell" decision needs; it is
    // removed for one measurement so `color` is the cell's own foreground.
    cursor.classList.remove('xterm-cursor')
    let background
    let foreground
    try {
      const style = getComputedStyle(cursor)
      foreground = style.color
      background = opaqueColor(style.backgroundColor, () => {
        const scrollable = node.querySelector('.xterm-scrollable-element')
        return scrollable === null ? 'rgb(0, 0, 0)' : getComputedStyle(scrollable).backgroundColor
      })
    } finally {
      cursor.classList.add('xterm-cursor')
    }
    const preferred = opaqueColor(preferredCursor() ?? background, () => background)
    const backgroundLuminance = luminance(background)
    const preferredLuminance = luminance(preferred)
    const contrast = (Math.max(backgroundLuminance, preferredLuminance) + 0.05) / (Math.min(backgroundLuminance, preferredLuminance) + 0.05)
    const fill = contrast >= 3 ? preferred : backgroundLuminance > 0.179 ? '#000000' : '#ffffff'
    node.style.setProperty('--dsh-tm-cursor', fill)
    node.style.setProperty('--dsh-tm-cursor-accent', luminance(fill) > 0.179 ? '#000000' : '#ffffff')
    node.style.setProperty('--dsh-tm-cursor-cell-bg', background)
    node.style.setProperty('--dsh-tm-cursor-cell-fg', foreground)
  })
}

function luminance(color) {
  const [r, g, b] = colorChannels(color).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function colorChannels(color) {
  if (typeof color !== 'string') return [0, 0, 0]
  if (color.startsWith('#')) {
    const hex = color.length === 4 ? color.slice(1).split('').map((part) => part + part).join('') : color.slice(1, 7)
    return [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((value) => Number.parseInt(value, 16))
  }
  const numbers = color.match(/[\d.]+/g)
  return numbers === null ? [0, 0, 0] : numbers.map(Number)
}

function opaqueColor(color, background) {
  const channels = colorChannels(color)
  const alpha = channels[3] ?? 1
  if (alpha === 1) return color
  const surface = colorChannels(background())
  const mixed = channels.slice(0, 3).map((channel, index) => Math.round(channel * alpha + surface[index] * (1 - alpha)))
  return `rgb(${mixed.join(', ')})`
}

function colorIndex(value) {
  return /^\d+$/.test(value) && Number(value) < 256 ? Number(value) : undefined
}

function oscColor(value) {
  const rgb = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/i.exec(value)
  let channels
  if (rgb !== null) {
    channels = rgb.slice(1)
    if (!channels.every((channel) => channel.length === channels[0].length)) return undefined
  } else {
    if (!/^#(?:[\da-f]{3}){1,4}$/i.test(value)) return undefined
    const width = (value.length - 1) / 3
    channels = [value.slice(1, width + 1), value.slice(width + 1, 2 * width + 1), value.slice(2 * width + 1)]
  }
  return `#${channels
    .map((channel) => {
      const byte =
        rgb === null
          ? Number.parseInt(channel.padEnd(2, '0').slice(0, 2), 16)
          : Math.round((Number.parseInt(channel, 16) * 255) / (16 ** channel.length - 1))
      return byte.toString(16).padStart(2, '0')
    })
    .join('')}`
}

/** Resolved opaque background/text colours of one element. */
export function paletteOf(element) {
  if (element === null) return { background: '#000000', foreground: '#ffffff' }
  const style = getComputedStyle(element)
  return { background: style.backgroundColor, foreground: style.color }
}

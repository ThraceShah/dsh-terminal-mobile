/**
 * Long-press word selection and copy for the mobile terminal screen.
 *
 * Why this exists: xterm draws its text into a `<canvas>`, so the browser's own
 * long-press text selection has nothing to grab — on a phone the terminal is a
 * read-only picture and there is no way to copy an error message out of it.
 * This module gives the screen back the one gesture a phone user expects: hold
 * a word, get a **Copy** chip.
 *
 * It is layered on the SAME touch listeners the scroll module uses and
 * coordinates with it through a shared `gesture` flag:
 *
 * - `touchstart` dismisses any visible chip and arms a long-press timer.
 * - Moving beyond `LONG_PRESS_SLOP_PX` before the timer fires means the gesture
 *   was a scroll: the timer is dropped and the scroll module keeps the event.
 * - When the timer fires the gesture is claimed — the word under the finger is
 *   selected through xterm's public `select()`, `gesture.selecting` is raised so
 *   the scroll module stands down, and a Copy chip is positioned over the
 *   selection.
 * - While `gesture.selecting` is up, `touchmove` extends the selection instead
 *   of scrolling: column-precise on the anchor row, whole lines across rows
 *   (the public API has no 2-D range select).
 * - `touchend` lowers `gesture.selecting`; the chip stays until the next tap.
 * - Tapping the chip copies `getSelection()` and confirms in place.
 *
 * @module selection
 */

/** Hold duration before a press becomes a selection, in milliseconds. */
export const LONG_PRESS_MS = 480

/** Movement that reclassifies a pending press as a scroll, in CSS pixels. */
export const LONG_PRESS_SLOP_PX = 10

/** How long the chip confirms a copy before it dismisses itself. */
export const FEEDBACK_MS = 1400

/**
 * Characters that BOUND a word rather than belong to one. Everything else that
 * is printable — including scripts without spaces — is part of a word, so a
 * path, a URL, a `host:port`, a version and a CJK run all select as one token.
 */
const WORD_BOUNDARIES = new Set([
  ' ', '\t', '\r', '\n', '"', "'", '`', '|', '&', ';', '<', '>', '(', ')', '{', '}', '[', ']', '$', '!', '?', '*', '#',
])

/**
 * Whether one character may be part of a selected word.
 * @param {string} char - a single character, or `''` for an empty cell.
 * @returns {boolean}
 */
export function isWordCharacter(char) {
  if (char === undefined || char === null || char === '') return false
  if (WORD_BOUNDARIES.has(char)) return false
  const code = char.codePointAt(0)
  if (code >= 0x21 && code <= 0x7e) return true
  // Any other non-whitespace, non-control character (CJK, accents, symbols) is
  // a word character too: a script without spaces must still select as a run.
  return !/\s/u.test(char)
}

/**
 * The columns of the word under `column`, as a half-open range.
 *
 * A column that sits on a boundary (a space, a quote, a shell operator) is not
 * inside a word, so there is nothing to select and the caller shows no chip —
 * the user simply presses a little to either side.
 *
 * @param {string} line - the row's text, trailing-trimmed.
 * @param {number} column - the 0-based column under the finger.
 * @returns {{start: number, end: number} | undefined}
 */
export function wordRangeAt(line, column) {
  if (typeof line !== 'string' || line.length === 0) return undefined
  const at = Math.min(Math.max(Math.floor(column), 0), line.length - 1)
  if (!isWordCharacter(line[at])) return undefined
  let start = at
  let end = at + 1
  while (start > 0 && isWordCharacter(line[start - 1])) start -= 1
  while (end < line.length && isWordCharacter(line[end])) end += 1
  return { start, end }
}

/**
 * The cell under a client point, in visible-grid terms.
 *
 * xterm renders either to a canvas or — as it does under this plugin, with the
 * accessibility renderer active — to one full-width `<div>` per row holding a
 * styled `<span>`. Both are handled here, because keying the whole gesture off
 * `querySelector('canvas')` made it a silent no-op on the renderer this plugin
 * actually gets:
 *
 * - Accessibility rows: the row box gives the line, and `columnAtPointInRow`
 *   walks the spans to place the finger inside it. Columns come from the text
 *   rather than from a division, so CJK — two columns to one character — still
 *   lands on the right cell.
 * - Canvas: the canvas CSS box IS the cell grid, so a column is a fraction of
 *   its width.
 *
 * The row is identified by geometry rather than by index, and it is returned as
 * a BUFFER row: `ydisp + domIndex`. This build of xterm emits no
 * `aria-rowindex` on `.xterm-rows` children — so the DOM index is the only
 * mapping available, and it is exact here because the terminal always fits its
 * container and a line never wraps.
 *
 * The one thing this mapping cannot see is a buffer row above the viewport that
 * rendered as more than one element. `ydisp` is therefore an explicit argument
 * rather than a value this module guesses: a caller that knows its renderer
 * wraps can supply the true offset, and one that cannot keeps the default.
 *
 * Every guard here is silent by design — a finger resting between rows, or on
 * a line the renderer has not laid out, is ordinary rather than an error — but
 * "the chip did not appear" is unactionable on its own. The guard that rejects
 * a point is reported through `onMiss`, so the same signal that tells the
 * caller nothing happened is what tells a test which guard fired.
 *
 * @param {HTMLElement} node - the screen host.
 * @param {number} cols - the emulator's column count.
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} [ydisp] - the buffer row at the top of the viewport.
 * @param {(guard: string) => void} [onMiss] - reports the guard that rejected the point.
 * @returns {{column: number, bufferRow: number, row: HTMLElement} | undefined}
 */
export function cellFromPoint(node, cols, clientX, clientY, ydisp = 0, onMiss) {
  const miss = (guard) => {
    onMiss?.(guard)
    return undefined
  }
  if (node === null || node === undefined) return miss('node')
  // A column index is only meaningful against a grid that has columns. The
  // canvas branch catches this through its own division; the accessibility
  // branch divides text instead, so the guard has to be stated once, here.
  if (!(cols > 0)) return miss('cols')
  const rows = node.querySelector('.xterm-rows')
  if (rows === null) return miss('rows')
  const target = findRowAtPoint(rows, clientY)
  if (target === undefined) return miss('row')
  const canvas = node.querySelector('canvas')
  if (canvas === null) {
    // No canvas: the accessibility renderer, whose row elements ARE the text.
    // Their box gives the line; only the columns need measuring, and they are
    // measured from the text itself so that CJK — two columns to one
    // character — lands on the right cell.
    const column = columnAtPointInRow(target.row, clientX, cols)
    if (column === undefined) return miss('column')
    return { column, bufferRow: ydisp + target.index, row: target.row }
  }
  const grid = canvas.getBoundingClientRect()
  if (grid.width <= 0) return miss('grid')
  const column = Math.floor(((clientX - grid.left) / grid.width) * cols)
  if (column < 0 || column >= cols) return miss('column')
  return { column, bufferRow: ydisp + target.index, row: target.row }
}

/**
 * The DOM row under a client point, with its index within the viewport.
 *
 * The probe shows `.xterm-rows` children carry no `aria-rowindex`, so the index
 * within the container IS the viewport row; the caller adds `ydisp` to reach the
 * buffer. A point above the first row or below the last resolves to no row at
 * all, because guessing a neighbour would select a line the finger never
 * touched.
 *
 * @param {HTMLElement} rows - the `.xterm-rows` container.
 * @param {number} clientY
 * @returns {{row: HTMLElement, index: number} | undefined}
 */
function findRowAtPoint(rows, clientY) {
  const children = rows.children
  for (let index = 0; index < children.length; index += 1) {
    const row = children[index]
    const box = row.getBoundingClientRect()
    if (box.height <= 0) continue
    // Bottom-inclusive so a finger on a row seam resolves to the lower row.
    if (clientY < box.top || clientY > box.bottom) continue
    return { row, index }
  }
  return undefined
}

/**
 * The column inside a DOM row element under a client point.
 *
 * An accessibility-renderer row is one full-width element, so its box alone says
 * nothing about columns; the columns are the text the row renders. The walk
 * accumulates each span's TEXT length — the unit `emulator.select()` wants —
 * not its pixels, so the mapping holds for CJK (two columns, one character) and
 * for the trailing padding a row carries to fill the grid.
 *
 * @param {HTMLElement} row
 * @param {number} clientX
 * @param {number} cols
 * @returns {number | undefined}
 */
export function columnAtPointInRow(row, clientX, cols) {
  const walker = row.ownerDocument.createTreeWalker(row, 4 /* NodeFilter.SHOW_TEXT */)
  let column = 0
  let lastColumn
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    if (text.length === 0) continue
    const range = row.ownerDocument.createRange()
    range.selectNodeContents(node)
    for (let offset = 0; offset < text.length; offset += 1) {
      range.setStart(node, offset)
      range.setEnd(node, offset + 1)
      const box = range.getBoundingClientRect()
      if (box.width > 0 || box.height > 0) lastColumn = column + offset
      // Left of this glyph means the finger is in the gap before it, or past
      // the end of the last span that had a box: the previous column is the hit.
      if (clientX < box.left) {
        range.detach()
        return lastColumn ?? 0
      }
      if (clientX <= box.right) {
        range.detach()
        return column + offset
      }
    }
    range.detach()
    column += text.length
  }
  // Past the last glyph: a row is padded out to the grid, so this is still the
  // row the finger is on and the column clamps to the last cell.
  if (column === 0) return undefined
  return Math.min(lastColumn ?? column - 1, Math.max(cols - 1, 0))
}

/**
 * The visible row element at a buffer row, or `undefined` when it is scrolled
 * out of view. Matched by DOM index plus `ydisp`, the same mapping
 * `cellFromPoint` inverts; a buffer row that rendered as more than one element
 * is not found for the same reason `cellFromPoint` cannot name one.
 *
 * @param {HTMLElement} rows - the `.xterm-rows` container.
 * @param {number} bufferRow
 * @param {number} [ydisp] - the buffer row at the top of the viewport.
 * @returns {HTMLElement | undefined}
 */
export function findRowByBufferRow(rows, bufferRow, ydisp = 0) {
  const index = bufferRow - ydisp
  if (index < 0 || index >= rows.childElementCount) return undefined
  return rows.children[index]
}

/**
 * The box the terminal's text is laid out in, in client coordinates.
 *
 * With the accessibility renderer the rows ARE the text, so their container is
 * the grid; with a canvas renderer the canvas is. Both are queried here because
 * either can be the active one.
 *
 * @param {HTMLElement} rows - the `.xterm-rows` container.
 * @param {HTMLElement} node - the screen host.
 * @returns {{left: number, width: number} | undefined}
 */
export function screenBox(rows, node) {
  const canvas = node.querySelector('canvas')
  const box = (canvas ?? rows).getBoundingClientRect()
  if (box.width <= 0) return undefined
  return { left: box.left, width: box.width }
}

/**
 * Whether a touch landed on the Copy chip.
 *
 * The chip lives inside the screen host, so the capture-phase scroll and
 * selection listeners would otherwise consume its press and the tap would never
 * reach it.
 * @param {{target?: {closest?: (selector: string) => unknown}}} event
 * @returns {boolean}
 */
export function isCopyChipTouch(event) {
  const target = event.target
  return typeof target?.closest === 'function' && target.closest('[data-terminal-mobile-copy]') !== null
}

/**
 * Whether a touch landed on a selection grip.
 *
 * The grips live inside the screen host for the same reason the chip does, and
 * need the same exemption: the capture-phase listeners run first, so a grip
 * press they consumed would never reach the grip's own handlers — and because
 * a press on the screen retires the selection, an unguarded grip would dismiss
 * the selection it is meant to adjust.
 * @param {{target?: {closest?: (selector: string) => unknown}}} event
 * @returns {boolean}
 */
export function isHandleTouch(event) {
  const target = event.target
  return typeof target?.closest === 'function' && target.closest('[data-terminal-mobile-handle]') !== null
}

/**
 * Put text on the clipboard, across the contexts DSH web actually runs in.
 *
 * The async clipboard API only exists in a secure context, and DSH web is
 * routinely served over plain http on a LAN address — there the hidden-textarea
 * + `execCommand('copy')` path is the one that works. Either may be missing in
 * a headless or permission-denied browser, so a `false` result is a real
 * outcome the caller surfaces, not an exception.
 *
 * @param {string} text
 * @param {object} [env] - injectable `{navigator, document}`; defaults to the page.
 * @returns {Promise<boolean>} whether the text reached the clipboard.
 */
export async function writeToClipboard(text, env) {
  const scope = env === undefined ? globalThis : env
  const clipboard = scope.navigator?.clipboard
  if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      /* Insecure context, denied permission, or a browser that refuses: fall through. */
    }
  }
  const doc = scope.document
  if (doc === undefined || doc === null || typeof doc.execCommand !== 'function') return false
  try {
    const area = doc.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    doc.body.appendChild(area)
    area.select()
    const copied = doc.execCommand('copy')
    doc.body.removeChild(area)
    return copied === true
  } catch {
    return false
  }
}

/**
 * Install long-press selection and the Copy chip on a screen host.
 *
 * @param {object} options
 * @param {HTMLElement} options.node - the screen host that owns the gestures.
 * @param {import('@xterm/xterm').Terminal} options.emulator - the opened emulator.
 * @param {{selecting: boolean}} options.gesture - shared flag read by `installScrollOwnership`.
 * @param {() => {copy: string, copied: string, copyFailed: string, handleStart: string, handleEnd: string}} options.labels - current-locale chip and grip copy.
 * @returns {{dispose: () => void}}
 */
export function installLongPressCopy(options) {
  const { node, emulator, gesture, labels } = options
  let timer = 0
  let feedbackTimer = 0
  let chip
  /**
   * The current selection, as its two ends in buffer coordinates.
   *
   * `start` is the anchor — the cell the finger first held, and the cell the
   * grips move away from — and `end` is the exclusive far edge. One range rather
   * than a word plus a direction is what lets a grip cross its own anchor: drag
   * the left grip past the right one and the two ends swap, which is the
   * behaviour a phone user already knows from native text selection.
   */
  let range
  /** The grips, in the order `['start', 'end']`, or `undefined` while hidden. */
  let handles
  /** Which end a grip is moving while its pointer is down, else `undefined`. */
  let handleDrag

  /** Whether there is a selection to adjust or copy. */
  const hasSelection = () => range !== undefined

  /**
   * The column the selection actually ends on.
   *
   * `end` is exclusive, so a selection that has shrunk to nothing still needs
   * one cell to draw and to name: an exclusive end that sits on the same column
   * as `start` would select nothing at all, and a grip placed there would be
   * unmovable. The clamp lives here rather than at each call site because both
   * the grips and the highlight read it.
   *
   * @param {{start: {column: number}, end: {column: number}}} selection
   * @returns {number} an inclusive column inside `selection.start`'s row.
   */
  const endColumnOf = (selection) => Math.max(selection.end.column, selection.start.column + 1)

  const clearTimer = () => {
    if (timer !== 0) {
      clearTimeout(timer)
      timer = 0
    }
  }

  const clearFeedback = () => {
    if (feedbackTimer !== 0) {
      clearTimeout(feedbackTimer)
      feedbackTimer = 0
    }
  }

  const lineAt = (bufferRow) => {
    try {
      const line = emulator.buffer.active.getLine(bufferRow)
      return line === undefined ? undefined : line.translateToString(true)
    } catch {
      return undefined
    }
  }

  const removeChip = () => {
    if (chip === undefined) return
    chip.remove()
    chip = undefined
  }

  /** Hide the grips without touching the highlight: a copy does not end a selection. */
  const removeHandles = () => {
    if (handles === undefined) return
    for (const handle of handles) handle.remove()
    handles = undefined
  }

  const dismiss = () => {
    clearFeedback()
    try {
      emulator.clearSelection()
    } catch {
      /* A disposed emulator throws; the chrome still goes away. */
    }
    removeChip()
    removeHandles()
    range = undefined
  }

  const showChip = (text) => {
    if (chip === undefined) {
      chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'dsh-tm-copychip'
      chip.setAttribute('data-terminal-mobile-copy', '')
      chip.addEventListener('pointerdown', onChipPress)
      node.appendChild(chip)
    }
    chip.textContent = text
  }

  /**
   * The client-space edges of the screen host, plus the grid's own left edge.
   *
   * Both the chip and the grips are positioned from this one measurement, so a
   * grip lands exactly on the boundary between two cells and cannot drift away
   * from the column the hit-test named.
   *
   * `left` is the host's edge and `gridLeft` the text's: the host carries
   * padding, and a column index counts from the text. `cellWidth` is a fallback
   * for a terminal that ships no measure probe, and is the less accurate of the
   * two — see `measureCellWidth`.
   *
   * @returns {{left: number, gridLeft: number, top: number, width: number, cellWidth: number} | undefined}
   */
  const hostGeometry = () => {
    const rows = node.querySelector('.xterm-rows')
    if (rows === null || rows.childElementCount === 0) return undefined
    const gridBox = screenBox(rows, node)
    if (gridBox === undefined) return undefined
    const hostBox = node.getBoundingClientRect()
    if (hostBox.width <= 0) return undefined
    return {
      left: hostBox.left,
      gridLeft: gridBox.left,
      top: hostBox.top,
      width: hostBox.width,
      cellWidth: gridBox.width / emulator.cols,
    }
  }

  /**
   * The exact width of one cell, in CSS pixels.
   *
   * Dividing the grid's width by the column count is wrong by an amount that
   * grows with the column, and this build of xterm makes the wrongness easy to
   * measure: it rounds the canvas width to a whole pixel and then divides that
   * rounded number by the column count to publish `cell.width`. Here the grid
   * is 352px over 45 columns — 7.822px — while the glyphs actually advance
   * 7.859px, so a grip placed at the last column lands a whole cell short of
   * the glyph it names.
   *
   * xterm keeps a hidden probe holding 32 M's, and dividing its width by 32 is
   * the obvious fix. It is subtly wrong too: the probe omits the `letter-spacing`
   * the rows carry, so it under-reports by roughly one pixel over thirty
   * columns and drifts a whole cell by the end of a normal command line.
   *
   * The rows carry the truth, and `pitchFromRow` reads it. This is only the
   * fallback for a row with fewer than two glyphs — a freshly cleared screen,
   * or a terminal that has not painted yet — where there is no pitch to read
   * and the probe's small error is the better of the two.
   *
   * @param {HTMLElement} row - the row a grip is being placed on.
   * @returns {number | undefined} the cell pitch, or `undefined` before layout.
   */
  const measureCellWidth = (row) => {
    const fromRow = pitchFromRow(row)
    if (fromRow !== undefined) return fromRow
    const probe = node.querySelector('.xterm-char-measure-element')
    if (probe === null) return undefined
    const text = probe.textContent ?? ''
    const width = probe.getBoundingClientRect().width
    // Guard the divisor rather than the division: a probe that has not been
    // populated yet reports a plausible-looking zero.
    if (text.length === 0 || width <= 0) return undefined
    return width / text.length
  }

  /**
   * The distance between two neighbouring glyphs in a row.
   *
   * A Range per character is the only way to read a cell's box: a row is one
   * text node, so `textContent` gives no boxes at all. The first glyph with a
   * box after the first glyph is the pitch — its left edge minus its
   * neighbour's — which is the same measurement the browser suite uses.
   *
   * @param {HTMLElement} row
   * @returns {number | undefined} the cell pitch, or `undefined` for a row of one glyph.
   */
  const pitchFromRow = (row) => {
    if (row === undefined || row === null) return undefined
    const walker = row.ownerDocument.createTreeWalker(row, 4 /* NodeFilter.SHOW_TEXT */)
    let previous
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      if (text.length === 0) continue
      const range = row.ownerDocument.createRange()
      range.selectNodeContents(node)
      for (let offset = 0; offset < text.length; offset += 1) {
        range.setStart(node, offset)
        range.setEnd(node, offset + 1)
        const box = range.getBoundingClientRect()
        if (box.width <= 0) continue
        if (previous !== undefined && box.left > previous.left) {
          const pitch = box.left - previous.left
          range.detach()
          return pitch
        }
        previous = box
      }
      range.detach()
    }
    return undefined
  }

  /**
   * The pixel box of a buffer row, in host coordinates.
   *
   * `undefined` when the row is scrolled out of view, which is the one case a
   * grip cannot be drawn for: it would have to name a column on a row that is
   * not on screen.
   *
   * @param {number} bufferRow
   * @returns {{left: number, top: number, width: number, height: number} | undefined}
   */
  const rowBoxOf = (bufferRow) => {
    const geometry = hostGeometry()
    if (geometry === undefined) return undefined
    const rows = node.querySelector('.xterm-rows')
    const row = findRowByBufferRow(rows, bufferRow, ydisp())
    if (row === undefined) return undefined
    const rowBox = row.getBoundingClientRect()
    const cellWidth = measureCellWidth(row) ?? geometry.cellWidth
    return {
      // The grid is inset by the host's padding, and a column index is an
      // offset from the grid — not from the host. Anchoring at zero put every
      // column a padding-width to the left of the glyph it names.
      left: geometry.gridLeft - geometry.left,
      top: rowBox.top - geometry.top,
      width: geometry.width,
      height: rowBox.height,
      cellWidth,
    }
  }

  /**
   * Place the chip over `cell`, falling back to the anchor when it scrolls off.
   *
   * The row comes from inverting the hit-test's own mapping — `bufferRow -
   * ydisp`, not an attribute — so the chip lands on the row the selection is
   * actually on rather than near it.
   */
  const placeChip = (cell) => {
    const box = rowBoxOf(cell.bufferRow)
    const margin = 4
    if (box === undefined || chip === undefined) return
    const chipBox = chip.getBoundingClientRect()
    const x = box.left + (cell.column + 0.5) * box.cellWidth
    chip.style.left = `${Math.round(Math.min(Math.max(x - chipBox.width / 2, margin), Math.max(node.clientWidth - chipBox.width - margin, margin)))}px`
    // Above the row when there is room, below it otherwise: a selection on the
    // first visible row would push the chip off the top of the screen.
    const above = box.top - chipBox.height - 6
    chip.style.top = `${Math.round(above >= 0 ? above : box.top + box.height + 6)}px`
  }

  const copySelection = async () => {
    // Read before the await: the clipboard write suspends, and a press on the
    // screen can dismiss the selection in that gap. Re-reading afterwards would
    // copy nothing at all.
    const text = emulator.getSelection()
    if (text === '') return
    const ok = await writeToClipboard(text)
    const strings = labels()
    // The clipboard write awaits, so the selection can go away under us: a
    // dismissed selection must not resurrect a chip with a stale position.
    if (!hasSelection()) return
    showChip(ok ? strings.copied : strings.copyFailed)
    placeChip(range.start)
    clearFeedback()
    feedbackTimer = setTimeout(() => {
      feedbackTimer = 0
      dismiss()
    }, FEEDBACK_MS)
  }

  /**
   * The cell a grip at `column` on `bufferRow` would name, clamped to the row.
   *
   * A grip's dot is drawn half a cell wide of its own edge, so a finger that
   * lands past the last column of a row still resolves to that column rather
   * than to nothing.
   *
   * @param {number} column
   * @param {number} bufferRow
   * @returns {{column: number, bufferRow: number}}
   */
  const gripCell = (column, bufferRow) => ({
    column: Math.min(Math.max(column, 0), Math.max(emulator.cols - 1, 0)),
    bufferRow,
  })

  /**
   * The half-open cell span the selection covers, in buffer coordinates.
   *
   * `range.end` is exclusive, so an untouched end still needs one cell: a
   * selection that has shrunk to nothing would otherwise select nothing at all,
   * and a grip placed on an empty span would have nothing to widen from.
   */
  const spanOf = (selection) => {
    const afterStart =
      selection.end.bufferRow > selection.start.bufferRow ||
      (selection.end.bufferRow === selection.start.bufferRow && selection.end.column > selection.start.column)
    const end = afterStart
      ? selection.end
      : { column: selection.start.column + 1, bufferRow: selection.start.bufferRow }
    return { start: selection.start, end }
  }

  /**
   * Move one end of the selection to the cell under the finger.
   *
   * Both ends may cross rows, and the selection stays character-precise when
   * they do: xterm's own `select()` takes a LINEAR length — its internal range
   * builder computes `(endRow - startRow) * cols - startColumn + endColumn` —
   * so a length that spans rows selects every cell between the two ends, not
   * the whole lines they sit on. Re-selecting whole lines was a guess at what a
   * grip could not express, and it was wrong: a drag two rows down selected
   * every column of the middle row when the finger only wanted the last few.
   *
   * The untouched end is the anchor, so the highlight always grows away from
   * where the finger first held.
   *
   * @param {'start' | 'end'} end - which end the grip is moving.
   * @param {{column: number, bufferRow: number}} current - the cell under the finger.
   */
  const moveTo = (end, current) => {
    if (range === undefined) return
    const span = spanOf(range)
    // The untouched end is the anchor: the highlight grows away from where the
    // finger first held, the way native selection does.
    const anchor = end === 'start' ? span.end : span.start
    const moving = gripCell(current.column, current.bufferRow)
    // Normalise the two ends into an ordered pair, so a grip dragged past its
    // own anchor swaps the ends instead of collapsing the selection. Only the
    // same-row case needs a trailing cell: across rows, `moving.column` is
    // already inclusive on its own row.
    const sameRow = anchor.bufferRow === moving.bufferRow
    const forward = sameRow ? anchor.column <= moving.column : anchor.bufferRow <= moving.bufferRow
    // `range.end` stays EXCLUSIVE: the long-press writer makes a one-character
    // word end on the next column, and both `spanOf` and `placeHandles` read
    // that convention. A grip dragged onto a cell therefore names the cell
    // after it, on whichever row the finger reached.
    const ordered = forward
      ? { start: { column: anchor.column, bufferRow: anchor.bufferRow }, end: { column: moving.column + 1, bufferRow: moving.bufferRow } }
      : { start: { column: moving.column, bufferRow: moving.bufferRow }, end: { column: anchor.column, bufferRow: anchor.bufferRow } }
    range = ordered
    try {
      // Across rows the linear span already reaches the end's cell; on one row
      // the exclusive end needs no adjustment either, because the length below
      // is derived from the same two ends.
      const spanRows = ordered.end.bufferRow - ordered.start.bufferRow
      const length = spanRows === 0 ? ordered.end.column - ordered.start.column : spanRows * emulator.cols - ordered.start.column + ordered.end.column
      emulator.select(ordered.start.column, ordered.start.bufferRow, Math.max(length, 1))
    } catch {
      return
    }
    placeChip(range.start)
    placeHandles()
  }

  /**
   * A grip press claims the gesture.
   *
   * `pointerdown`, not `click`, and the capture-phase screen listeners are
   * cancelled here: they run before the target's own handlers, so a grip press
   * they saw first would be read as a tap that dismisses the very selection the
   * grip is meant to adjust.
   */
  const onHandlePress = (event) => {
    const handle = event.currentTarget
    const end = handle.getAttribute('data-terminal-mobile-handle') === 'end' ? 'end' : 'start'
    event.preventDefault()
    event.stopPropagation()
    if (!hasSelection()) return
    handleDrag = end
    gesture.selecting = true
    handle.setPointerCapture?.(event.pointerId)
    const move = (moveEvent) => {
      if (handleDrag === undefined) return
      if (moveEvent.cancelable) moveEvent.preventDefault()
      moveEvent.stopPropagation()
      const current = cellFromPoint(node, emulator.cols, moveEvent.clientX, moveEvent.clientY, ydisp())
      if (current !== undefined) moveTo(handleDrag, current)
    }
    const finish = () => {
      handleDrag = undefined
      gesture.selecting = false
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  /**
   * Show the two grips at the ends of the current selection.
   *
   * The grips live beside the chip, not inside it: copying and adjusting are
   * different gestures, and one control doing both means a press meant to copy
   * lands on the wrong thing once the selection moves under the finger.
   *
   * Each grip is a 44px box whose visible dot sits at a cell edge, so the press
   * target is a finger-sized area centred on a 10px mark.
   */
  const showHandles = () => {
    if (range === undefined) return
    if (handles === undefined) {
      // One label per end, so a screen reader names the edge it is moving
      // rather than announcing two identical grips.
      handles = [
        { end: 'start', label: labels().handleStart },
        { end: 'end', label: labels().handleEnd },
      ].map(({ end, label }) => {
        const handle = document.createElement('button')
        handle.type = 'button'
        handle.className = 'dsh-tm-handle'
        handle.setAttribute('data-terminal-mobile-handle', end)
        handle.setAttribute('aria-label', label)
        handle.addEventListener('pointerdown', onHandlePress)
        node.appendChild(handle)
        return handle
      })
    }
    placeHandles()
  }

  const placeHandles = () => {
    if (range === undefined || handles === undefined) return
    const ends = [range.start, range.end]
    for (let index = 0; index < handles.length; index += 1) {
      const handle = handles[index]
      const box = rowBoxOf(ends[index].bufferRow)
      if (box === undefined) {
        // The end is scrolled off; park the grip out of the way rather than
        // leave it floating over unrelated output.
        handle.style.left = '-9999px'
        handle.style.top = '-9999px'
        handle.setAttribute('aria-hidden', 'true')
        continue
      }
      handle.removeAttribute('aria-hidden')
      // `box.left` is the grid's inset from the host edge: a column index is an
      // offset from the grid, not from the host, so anchoring at zero put every
      // grip a padding-width to the left of the glyph it names. The dot is
      // centred in its 44px box, so half the box puts that centre on the cell
      // boundary the grip names.
      const column = index === 0 ? ends[index].column : endColumnOf(range)
      handle.style.left = `${Math.round(box.left + (column + (index === 0 ? 0.5 : -0.5)) * box.cellWidth - 22)}px`
      handle.style.top = `${Math.round(box.top - 10)}px`
    }
  }

  const onChipPress = (event) => {
    // Pointerdown, not click: the screen's capture-phase touch listeners run
    // before the target's, so acting here (and cancelling the compatibility
    // mouse events) is what keeps the press from being swallowed.
    event.preventDefault()
    event.stopPropagation()
    void copySelection()
  }

  /**
   * Record why a long-press declined to select anything.
   *
   * Every path out of `fireLongPress` that returns nothing is silent, and each
   * one means a different defect — a bad hit-test, a missing line, a column
   * outside every word. The reason is published on the host as a `data-*`
   * attribute, following the plugin's existing convention, so a test can name
   * the failure instead of reporting only "no chip appeared".
   */
  const skip = (reason) => {
    lastSkip = reason
    node.setAttribute('data-terminal-mobile-select-skip', reason)
    return undefined
  }

  /**
   * The buffer row at the top of the viewport.
   *
   * `ydisp` is the offset the DOM rows are rendered from, and it is not in
   * xterm's public typings — `baseY` is, and the two are equal whenever no line
   * wraps. Read through a cast so that a build which exposes `ydisp` directly
   * costs nothing, and so the one assumption this mapping rests on is named in
   * one place instead of being spread across the gesture.
   *
   * @returns {number}
   */
  const ydisp = () => {
    const buffer = emulator.buffer.active
    const typed = /** @type {{ ydisp?: number, baseY: number }} */ (buffer)
    return typeof typed.ydisp === 'number' ? typed.ydisp : buffer.baseY
  }

  /**
   * Select the word under the finger and put the chip and grips around it.
   *
   * The word is the default the grips then adjust, so this is the one place a
   * selection is created rather than moved.
   */
  const fireLongPress = (touch) => {
    lastSkip = undefined
    node.removeAttribute('data-terminal-mobile-select-skip')
    const cell = cellFromPoint(node, emulator.cols, touch.clientX, touch.clientY, ydisp(), skip)
    if (cell === undefined) return
    const bufferRow = cell.bufferRow
    const line = lineAt(bufferRow)
    if (line === undefined) return skip('line')
    const word = wordRangeAt(line, cell.column)
    if (word === undefined) return skip('word')
    try {
      emulator.select(word.start, bufferRow, word.end - word.start)
    } catch (error) {
      return skip(`select:${String(error && error.message)}`)
    }
    range = {
      start: { column: word.start, bufferRow },
      // Exclusive, so a one-character word ends on the next column.
      end: { column: word.end, bufferRow },
    }
    gesture.selecting = true
    showChip(labels().copy)
    placeChip(range.start)
    showHandles()
  }

  let start
  let dragging = false
  let lastSkip

  /**
   * Why the most recent long-press selected nothing, if it did.
   *
   * `fireLongPress` exits silently from several places, and each one is a
   * different defect; naming it lets a test report which rather than only that
   * no chip appeared.
   *
   * @returns {string | undefined} `undefined` once a selection succeeded.
   */
  const skipReason = () => lastSkip

  const onTouchStart = (event) => {
    if (isCopyChipTouch(event)) return
    if (isHandleTouch(event)) return
    clearTimer()
    start = undefined
    dragging = false
    if (event.touches.length !== 1) {
      // A second finger is a pinch, not a selection.
      if (chip !== undefined) dismiss()
      return
    }
    // A press anywhere else retires the current selection, matching how a tap
    // dismisses native text selection.
    if (chip !== undefined) dismiss()
    const touch = event.touches[0]
    start = { x: touch.clientX, y: touch.clientY }
    timer = setTimeout(() => {
      timer = 0
      fireLongPress(touch)
      dragging = gesture.selecting
    }, LONG_PRESS_MS)
  }

  const onTouchMove = (event) => {
    if (isCopyChipTouch(event)) return
    if (isHandleTouch(event)) return
    if (event.touches.length !== 1) {
      clearTimer()
      start = undefined
      return
    }
    const touch = event.touches[0]
    if (!dragging) {
      if (start === undefined) return
      const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
      // Past the slop this is a scroll; the timer must not fire mid-swipe.
      if (moved > LONG_PRESS_SLOP_PX) clearTimer()
      return
    }
    // The gesture is claimed: keep the scroll module and the page out of it.
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
    const current = cellFromPoint(node, emulator.cols, touch.clientX, touch.clientY, ydisp())
    if (current !== undefined) moveTo('end', current)
  }

  const onTouchEnd = () => {
    clearTimer()
    start = undefined
    if (!dragging) return
    dragging = false
    // Released: the highlight stays until the next press, but the next gesture
    // belongs to scrolling again.
    gesture.selecting = false
  }

  node.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
  node.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  node.addEventListener('touchend', onTouchEnd, { passive: false, capture: true })
  node.addEventListener('touchcancel', onTouchEnd, { passive: false, capture: true })

  return {
    skipReason,
    dispose() {
      clearTimer()
      clearFeedback()
      gesture.selecting = false
      removeChip()
      removeHandles()
      node.removeEventListener('touchstart', onTouchStart, { capture: true })
      node.removeEventListener('touchmove', onTouchMove, { capture: true })
      node.removeEventListener('touchend', onTouchEnd, { capture: true })
      node.removeEventListener('touchcancel', onTouchEnd, { capture: true })
    },
  }
}

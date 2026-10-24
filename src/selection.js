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
 * @param {() => {copy: string, copied: string, copyFailed: string}} options.labels - current-locale chip copy.
 * @returns {{dispose: () => void}}
 */
export function installLongPressCopy(options) {
  const { node, emulator, gesture, labels } = options
  let timer = 0
  let feedbackTimer = 0
  let chip
  /** Anchor of the current selection: the word the finger first held. */
  let anchor

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

  const dismiss = () => {
    clearFeedback()
    try {
      emulator.clearSelection()
    } catch {
      /* A disposed emulator throws; the chip still goes away. */
    }
    removeChip()
    anchor = undefined
  }

  /** The cell the selection visually starts at, for chip placement. */
  const selectionStartOf = (current) => {
    if (current.bufferRow === anchor.bufferRow) {
      return { column: Math.min(anchor.column, current.column), bufferRow: anchor.bufferRow }
    }
    return { column: 0, bufferRow: Math.min(anchor.bufferRow, current.bufferRow) }
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
   * Place the chip over `cell`, falling back to the anchor when it scrolls off.
   *
   * The row is found by inverting the hit-test's own mapping — `bufferRow -
   * ydisp`, not an attribute — and the column by measuring the row's text, so
   * the chip lands on the row the selection is actually on rather than near it.
   */
  const placeChip = (cell) => {
    const rows = node.querySelector('.xterm-rows')
    if (rows === null || rows.childElementCount === 0) return
    const hostBox = node.getBoundingClientRect()
    const row = findRowByBufferRow(rows, cell.bufferRow, ydisp())
    const gridBox = screenBox(rows, node)
    const chipBox = chip.getBoundingClientRect()
    const margin = 4
    if (row !== undefined && gridBox !== undefined) {
      const cellWidth = gridBox.width / emulator.cols
      const x = gridBox.left - hostBox.left + (cell.column + 0.5) * cellWidth
      chip.style.left = `${Math.round(Math.min(Math.max(x - chipBox.width / 2, margin), Math.max(hostBox.width - chipBox.width - margin, margin)))}px`
    } else {
      chip.style.left = `${margin}px`
    }
    if (row === undefined) {
      // The anchored row is out of view; pin the chip to the top edge rather
      // than let it float over unrelated output.
      chip.style.top = `${margin}px`
      return
    }
    const rowBox = row.getBoundingClientRect()
    const above = rowBox.top - hostBox.top - chipBox.height - 6
    chip.style.top = `${Math.round(above >= 0 ? above : rowBox.bottom - hostBox.top + 6)}px`
  }

  const copySelection = async () => {
    // Read before the await: the clipboard write suspends, and a press on the
    // screen can dismiss the selection in that gap. Re-reading afterwards would
    // copy nothing at all.
    const text = emulator.getSelection()
    if (text === '') return
    const ok = await writeToClipboard(text)
    const strings = labels()
    // The clipboard write awaits, so the anchor can go away under us: a
    // dismissed selection must not resurrect a chip with a stale position.
    if (anchor === undefined) return
    showChip(ok ? strings.copied : strings.copyFailed)
    placeChip({ column: anchor.column, bufferRow: anchor.bufferRow })
    clearFeedback()
    feedbackTimer = setTimeout(() => {
      feedbackTimer = 0
      dismiss()
    }, FEEDBACK_MS)
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

  const fireLongPress = (touch) => {
    lastSkip = undefined
    node.removeAttribute('data-terminal-mobile-select-skip')
    const cell = cellFromPoint(node, emulator.cols, touch.clientX, touch.clientY, ydisp(), skip)
    if (cell === undefined) return
    const bufferRow = cell.bufferRow
    const line = lineAt(bufferRow)
    if (line === undefined) return skip('line')
    const range = wordRangeAt(line, cell.column)
    if (range === undefined) return skip('word')
    try {
      emulator.select(range.start, bufferRow, range.end - range.start)
    } catch (error) {
      return skip(`select:${String(error && error.message)}`)
    }
    anchor = { column: range.start, end: range.end, bufferRow }
    gesture.selecting = true
    showChip(labels().copy)
    placeChip({ column: range.start, bufferRow })
  }

  const extendTo = (clientX, clientY) => {
    const current = cellFromPoint(node, emulator.cols, clientX, clientY, ydisp())
    if (current === undefined) return
    const bufferRow = current.bufferRow
    try {
      if (bufferRow === anchor.bufferRow) {
        const column = Math.min(Math.max(current.column, 0), emulator.cols - 1)
        const start = Math.min(anchor.column, column)
        const end = Math.max(anchor.end, column + 1)
        emulator.select(start, anchor.bufferRow, end - start)
      } else {
        emulator.selectLines(Math.min(anchor.bufferRow, bufferRow), Math.max(anchor.bufferRow, bufferRow))
      }
    } catch {
      return
    }
    placeChip(selectionStartOf({ column: current.column, bufferRow }))
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
    if (anchor !== undefined) extendTo(touch.clientX, touch.clientY)
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
      node.removeEventListener('touchstart', onTouchStart, { capture: true })
      node.removeEventListener('touchmove', onTouchMove, { capture: true })
      node.removeEventListener('touchend', onTouchEnd, { capture: true })
      node.removeEventListener('touchcancel', onTouchEnd, { capture: true })
    },
  }
}

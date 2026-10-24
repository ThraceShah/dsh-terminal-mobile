/**
 * Pure-logic test of the long-press selection module.
 *
 * These run against the SOURCES and cover the parts that decide what a finger
 * press means: which characters form a selectable word, how a word range is
 * found, how a client point maps to a grid cell, how the Copy chip's own press
 * is told apart from a press on the terminal, and which clipboard path wins in
 * each origin DSH web actually runs in.
 *
 * The gesture state machine itself (timers, the shared `selecting` flag, the
 * chip's lifecycle) is asserted in the browser suite, where real timers and a
 * real xterm are available.
 */
import { createSuite } from './harness.mjs'
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX, cellFromPoint, findRowByBufferRow, isCopyChipTouch, isWordCharacter, wordRangeAt, writeToClipboard } from '../src/selection.js'

const suite = createSuite('selection')

suite.check('a long-press outlasts the slop window', LONG_PRESS_MS >= 300)
suite.check('the slop is small enough to feel like a hold', LONG_PRESS_SLOP_PX <= 20)

// ── word characters ─────────────────────────────────────────────────────────
{
  suite.check('letters are word characters', isWordCharacter('a') && isWordCharacter('Z'))
  suite.check('digits are word characters', isWordCharacter('7'))
  // Path, URL, host:port and version characters must stay INSIDE a token, or a
  // long-press on a path would select one fragment of it.
  for (const char of ['/', '.', ':', '@', '-', '_', '~', '+', '=', ',', '%']) {
    suite.check(`${JSON.stringify(char)} stays inside a word`, isWordCharacter(char))
  }
  for (const char of [' ', '\t', '\n', '"', "'", '|', '&', ';', '<', '>', '(', ')', '$', '*', '#']) {
    suite.check(`${JSON.stringify(char)} bounds a word`, isWordCharacter(char) === false)
  }
  suite.check('an empty cell is not a word character', isWordCharacter('') === false)
  suite.check('undefined is not a word character', isWordCharacter(undefined) === false)
  // A script without spaces must still select as a run, so CJK is a word
  // character even though it sits outside printable ASCII.
  suite.check('CJK is a word character', isWordCharacter('終') === true)
  suite.check('an accented letter is a word character', isWordCharacter('é') === true)
  // The rule is "no spaces means one run", and it is deliberately literal:
  // CJK and other non-ASCII marks are word characters, and so is NUL. The
  // emulator never emits NUL into a row, so nothing selectable is affected.
  const nul = String.fromCharCode(0)
  suite.check('a NUL follows the no-space rule', isWordCharacter(nul) === true)
}

// ── word ranges ─────────────────────────────────────────────────────────────
{
  const line = 'cp src/app.js /tmp/out.txt'
  const whole = wordRangeAt(line, 0)
  suite.equal('the first token is the command word', whole, { start: 0, end: 2 })
  const path = wordRangeAt(line, 17)
  suite.equal('a press mid-path selects the whole path', path, { start: 14, end: 26 })
  suite.check('a press on a space selects nothing', wordRangeAt(line, 13) === undefined)
  // A column past the end clamps to the last cell, which is still inside the
  // final token: a finger landing on the padding after a word selects the word.
  suite.equal('a column past the end clamps into the last word', wordRangeAt(line, 999), { start: 14, end: 26 })
  suite.check('an empty line selects nothing', wordRangeAt('', 0) === undefined)
  suite.check('a non-string line selects nothing', wordRangeAt(undefined, 0) === undefined)
  suite.equal('a negative column clamps to the line start', wordRangeAt('abc', -5), { start: 0, end: 3 })
  const url = 'https://example.com/a?b=1'
  // '?' bounds a word, so the scheme and host select as one token and the query
  // is a separate press — matching how a shell would word-split the URL.
  suite.equal('a URL host selects as one token', wordRangeAt(url, 10), { start: 0, end: 21 })
  suite.equal('a CJK run selects as one token', wordRangeAt('终端无法复制', 2), { start: 0, end: 6 })
  suite.equal('a single-character line selects itself', wordRangeAt('x', 0), { start: 0, end: 1 })
}

// ── client point to grid cell ───────────────────────────────────────────────
{
  // Under the accessibility renderer a row is one element holding a styled
  // span, and the DOM index IS the viewport row — xterm emits no
  // `aria-rowindex` on these children, so a fake reproducing anything else
  // tests a contract that does not exist. The row box places the finger on a
  // line, and the spans place the finger inside it.
  const makeNode = (rowSpecs) => {
    const node = {
      querySelector(selector) {
        if (selector !== '.xterm-rows') return null
        return { children: rowSpecs.map(makeRow), childElementCount: rowSpecs.length }
      },
    }
    return node
  }
  const makeRow = (spec) => {
    const row = {
      ownerDocument: fakeDocument,
      // No class and no `aria-rowindex`: this is what the probe found in the
      // live terminal, and the module must work with exactly that.
      classList: { contains: () => false },
      getAttribute: () => null,
      getBoundingClientRect: () => ({ top: spec.top, bottom: spec.top + spec.height, left: 0, right: 800, height: spec.height, width: 800 }),
    }
    row.text = spec.text
    return row
  }
  // A TreeWalker over the row's single text node, and a Range whose box is the
  // glyph's slice of the row at a fixed cell width.
  const fakeDocument = {
    createTreeWalker(root, whatToShow) {
      if (whatToShow !== 4) throw new Error(`unexpected filter ${whatToShow}`)
      let step = 0
      return {
        nextNode() {
          step += 1
          return step === 1 ? { textContent: root.text } : null
        },
      }
    },
    createRange() {
      let start = 0
      let end = 0
      return {
        selectNodeContents() {},
        setStart(_node, offset) { start = offset },
        setEnd(_node, offset) { end = offset },
        detach() {},
        getBoundingClientRect() {
          return { left: start * 10, right: end * 10, width: 10, height: 15, top: 0, bottom: 15 }
        },
      }
    },
  }

  // Three 20px rows. `bufferRow` is what each row holds in the buffer, so the
  // fixtures read as buffer coordinates; the mapping under test is that the
  // third row of the viewport is the third row of the buffer.
  const node = makeNode([
    { top: 100, height: 20, text: 'a b' },
    { top: 120, height: 20, text: 'SELECTME tail' },
    { top: 140, height: 20, text: 'c' },
  ])

  // `cellOf` projects a cell down to the two coordinates the mapping is about;
  // the row element itself travels with the cell because it is what `placeChip`
  // measures.
  const cellOf = (x, y) => {
    const cell = cellFromPoint(node, 80, x, y)
    if (cell === undefined) return undefined
    return { column: cell.column, bufferRow: cell.bufferRow }
  }

  suite.equal('a point maps to its column and buffer row', cellOf(125, 130), { column: 12, bufferRow: 1 })
  suite.check('a zero-column grid is rejected', cellFromPoint(node, 0, 10, 105) === undefined)
  suite.equal('a point on the first column maps to column 0', cellOf(0, 105), { column: 0, bufferRow: 0 })
  suite.equal('a point in the last row resolves its own buffer row', cellOf(5, 150), { column: 0, bufferRow: 2 })
  // A finger off the left edge resolves into the row it is level with, the same
  // way one past the last glyph clamps to the final column; the row stays the
  // unit that decides whether there is a cell at all.
  suite.equal('a point left of the grid clamps to column 0', cellOf(-1, 105), { column: 0, bufferRow: 0 })
  suite.equal('a point right of the row text clamps to its last column', cellOf(900, 130), { column: 12, bufferRow: 1 })
  suite.check('a point above every row is rejected', cellFromPoint(node, 80, 10, 50) === undefined)
  suite.check('a point below every row is rejected', cellFromPoint(node, 80, 10, 900) === undefined)
  const empty = { querySelector: () => null }
  suite.check('a screen without a rows container is rejected', cellFromPoint(empty, 80, 10, 105) === undefined)
  suite.check('a missing node is rejected', cellFromPoint(null, 80, 10, 105) === undefined)

  // A viewport row and a buffer row differ by the scroll offset, and that is
  // the whole reason `ydisp` is an argument: with the screen scrolled up by 40
  // rows the same finger lands on buffer row 41, not row 1.
  const scrolled = (x, y) => {
    const cell = cellFromPoint(node, 80, x, y, 40)
    return cell === undefined ? undefined : { column: cell.column, bufferRow: cell.bufferRow }
  }
  suite.equal('the viewport offset is added to reach the buffer row', scrolled(125, 130), { column: 12, bufferRow: 41 })

  // `findRowByBufferRow` is the same mapping in reverse, and it is what places
  // the chip: a row scrolled out of view simply is not found.
  const rows = node.querySelector('.xterm-rows')
  suite.check('a visible buffer row is found', findRowByBufferRow(rows, 2) !== undefined)
  suite.check('a row scrolled above the viewport is not found', findRowByBufferRow(rows, 7) === undefined)
}

// ── telling the Copy chip's press apart ─────────────────────────────────────
{
  const chipTarget = { closest: (selector) => (selector === '[data-terminal-mobile-copy]' ? {} : null) }
  suite.check('a press on the chip is recognised', isCopyChipTouch({ target: chipTarget }))
  const screenTarget = { closest: () => null }
  suite.check('a press on the screen is not the chip', isCopyChipTouch({ target: screenTarget }) === false)
  suite.check('a target without closest is not the chip', isCopyChipTouch({ target: {} }) === false)
  suite.check('a missing target is not the chip', isCopyChipTouch({}) === false)
}

// ── clipboard paths ─────────────────────────────────────────────────────────
{
  const writes = []
  const secure = await writeToClipboard('hello', {
    navigator: { clipboard: { writeText: async (text) => writes.push(text) } },
  })
  suite.equal('the async clipboard wins when it exists', secure, true)
  suite.equal('the async clipboard received the text', writes, ['hello'])

  // A secure context that refuses the write must fall through to execCommand
  // rather than surface as an error.
  const fallback = []
  const rejecting = await writeToClipboard('world', {
    navigator: { clipboard: { writeText: async () => { throw new Error('denied') } } },
    document: {
      createElement: () => ({ value: '', style: {}, setAttribute() {}, select() {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: (command) => fallback.push(command) === 1,
    },
  })
  suite.equal('a rejected async write falls back to execCommand', rejecting, true)
  suite.equal('the fallback ran the copy command', fallback, ['copy'])

  // Plain http on a LAN address — the common phone case — has no async
  // clipboard at all, so execCommand is the path that works there.
  const lan = await writeToClipboard('lan', {
    document: {
      createElement: () => ({ value: '', style: {}, setAttribute() {}, select() {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => true,
    },
  })
  suite.equal('a plain-http origin still copies through execCommand', lan, true)

  const refused = await writeToClipboard('nope', {
    document: {
      createElement: () => ({ value: '', style: {}, setAttribute() {}, select() {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => false,
    },
  })
  suite.equal('a refused copy reports false rather than throwing', refused, false)

  const nothing = await writeToClipboard('nothing', {})
  suite.equal('an origin with no clipboard support reports false', nothing, false)
}

suite.finish()

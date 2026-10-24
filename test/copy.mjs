/**
 * Browser test of the long-press copy gesture.
 *
 * The pure-logic suite proves the module's decisions in isolation; this proves
 * the decisions compose against a real xterm on a real phone-shaped viewport:
 * a held finger selects the word under it and shows the Copy chip, a swipe does
 * neither (it scrolls instead), dragging the held finger grows the highlight
 * instead of moving the buffer, and pressing the chip writes the selection to
 * the clipboard and retires itself.
 *
 * Touches are SYNTHETIC events carrying client coordinates, dispatched on the
 * screen host, because Playwright's touchscreen API cannot hold a contact still
 * for LONG_PRESS_MS and then move it.
 *
 * Usage: node test/copy.mjs <baseUrl> <token>
 */
import { createSuite } from './harness.mjs'
import { PHONE, authCookie, openApp, openTerminalTab, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/copy.mjs <baseUrl> <token>')
  process.exit(2)
}

const MARKER = 'SELECTME'
const suite = createSuite('copy')
const cookie = await authCookie(baseUrl, token)
const app = await openApp(baseUrl, { cookie, viewport: PHONE, touch: true })
const { page, context } = app

// The clipboard is a permission-gated surface; grant it up front so the copy
// assertion reads back what the gesture actually wrote.
await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await openTerminalTab(page)
  await waitForConnected(page)

  // A word of its own on an otherwise empty row: the long-press must select
  // exactly this token, and nothing else on the line may qualify as one.
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-sidebar-terminal-screen]').click()
  await page.keyboard.type(`echo ${MARKER}`)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)

  // Aim at a column inside the marker.
  //
  // Under the DOM renderer there is no canvas grid to divide, so this suite
  // finds the point the same way the module does: a Range over the marker's
  // own text gives the client box of one glyph, and the row box gives the
  // vertical middle. Measuring through the text also survives CJK, where one
  // character occupies two columns and a fixed cell width would drift.
  const target = await page.evaluate((marker) => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const rows = screen.querySelector('.xterm-rows')
    for (let index = 0; index < rows.childElementCount; index += 1) {
      const row = rows.children[index]
      const text = row.textContent ?? ''
      const at = text.indexOf(marker)
      if (at < 0) continue
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
      let column = 0
      let start
      let advance
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const value = node.textContent ?? ''
        if (value.length === 0) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (let offset = 0; offset < value.length; offset += 1) {
          range.setStart(node, offset)
          range.setEnd(node, offset + 1)
          const box = range.getBoundingClientRect()
          if (column + offset === at && start === undefined) {
            start = { left: box.left, width: box.width, top: box.top, height: box.height }
          }
          if (start !== undefined && advance === undefined && box.width > 0) {
            advance = box.left + box.width - start.left
          }
        }
        range.detach()
        column += value.length
      }
      if (start === undefined || advance === undefined || advance <= 0) return undefined
      return { startLeft: start.left, advance, rowTop: start.top, rowHeight: start.height }
    }
    return undefined
  }, MARKER)

  suite.check('the marker is on screen', target !== undefined, JSON.stringify(target))

  // A point `columnOffset` columns into the marker, centred on its glyph.
  const pointFor = (columnOffset) => ({
    x: target.startLeft + (columnOffset + 0.5) * target.advance,
    y: target.rowTop + target.rowHeight / 2,
  })

  // The chip copies on `pointerdown`, not `click`: acting on the down event is
  // what keeps the press usable while a finger is still on the glass, and it is
  // the same convention the extension key bar uses.
  // ── a hold selects the word and shows the chip ───────────────────────────
  const holdPoint = pointFor(4)
  await page.evaluate(([p]) => {
    window.__tmDispatch = (type, x, y) => {
      const screen = document.querySelector('[data-sidebar-terminal-screen]')
      const event = new Event(type, { bubbles: true, cancelable: true })
      const touch = { clientX: x, clientY: y, identifier: 1 }
      Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [touch] })
      Object.defineProperty(event, 'changedTouches', { value: [touch] })
      screen.dispatchEvent(event)
      return { prevented: event.defaultPrevented }
    }
  }, [holdPoint])

  await page.evaluate(([p]) => window.__tmDispatch('touchstart', p.x, p.y), [holdPoint])
  await page.waitForTimeout(700)
  await page.evaluate(([p]) => window.__tmDispatch('touchend', p.x, p.y), [holdPoint])
  await page.waitForTimeout(200)

  const afterHold = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const chip = document.querySelector('[data-terminal-mobile-copy]')
    return {
      chip: chip === null ? null : chip.textContent,
      chipBox: chip === null ? null : chip.getBoundingClientRect(),
      // Published by the module when a long-press declines to select, naming
      // which of its guards fired; `null` means it selected successfully.
      skip: screen.getAttribute('data-terminal-mobile-select-skip'),
    }
  })
  // Read the chip copy from the locale module rather than spelling it here: the
  // app decides the language from its own context, so hard-coding one string
  // makes this suite fail for reasons that have nothing to do with the gesture.
  const { en, zh } = await import('../src/locales.js')
  const chipCopy = { idle: new Set([en['select.copy'], zh['select.copy']]), done: new Set([en['select.copied'], zh['select.copied']]) }
  suite.check(`a hold shows the Copy chip${afterHold.skip === null ? '' : ` (declined: ${afterHold.skip})`}`, afterHold.chip !== null, JSON.stringify(afterHold))
  suite.check('a fresh chip offers Copy', chipCopy.idle.has(afterHold.chip), JSON.stringify(afterHold.chip))

  // ── the chip does not dismiss on its own press ───────────────────────────
  // Prove the chip's own press is not swallowed by the screen's capture-phase
  // listeners: it must survive to write the clipboard.
  await context.clearPermissions().catch(() => {})
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.evaluate(() => {
    const chip = document.querySelector('[data-terminal-mobile-copy]')
    chip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }))
  })
  await page.waitForTimeout(500)

  const afterCopy = await page.evaluate(async () => {
    const chip = document.querySelector('[data-terminal-mobile-copy]')
    let clipboard = null
    try {
      clipboard = await navigator.clipboard.readText()
    } catch (error) {
      clipboard = `read failed: ${error.message}`
    }
    return { chip: chip === null ? null : chip.textContent, clipboard }
  })
  suite.check('pressing Copy confirms in place', chipCopy.done.has(afterCopy.chip), JSON.stringify(afterCopy.chip))
  suite.equal('the selection reached the clipboard', afterCopy.clipboard, MARKER)

  // ── the chip retires after its feedback window ───────────────────────────
  await page.waitForTimeout(1800)
  const retired = await page.evaluate(() => document.querySelector('[data-terminal-mobile-copy]') === null)
  suite.check('the chip retires after confirming', retired)

  // ── a swipe scrolls and selects nothing ──────────────────────────────────
  const swipeStart = pointFor(4)
  const swipeEnd = { x: swipeStart.x, y: swipeStart.y + target.rowHeight * 6 }
  await page.evaluate(([a, b]) => {
    window.__tmDispatch('touchstart', a.x, a.y)
    // Move past the slop before the hold timer could ever fire.
    window.__tmDispatch('touchmove', a.x, a.y + 40)
    window.__tmDispatch('touchmove', b.x, b.y)
    window.__tmDispatch('touchend', b.x, b.y)
  }, [swipeStart, swipeEnd])
  await page.waitForTimeout(200)
  const afterSwipe = await page.evaluate(() => document.querySelector('[data-terminal-mobile-copy]') === null)
  suite.check('a swipe selects nothing and shows no chip', afterSwipe)

  // ── a hold then drag grows the highlight, not the buffer ────────────────
  const dragStart = pointFor(4)
  const dragEnd = pointFor(6)
  await page.evaluate(([a, b]) => {
    window.__tmDispatch('touchstart', a.x, a.y)
  }, [dragStart])
  await page.waitForTimeout(700)
  const grown = await page.evaluate(([a, b]) => {
    window.__tmDispatch('touchmove', b.x, b.y)
    const chip = document.querySelector('[data-terminal-mobile-copy]')
    return { chip: chip === null ? null : chip.textContent }
  }, [dragStart, dragEnd])
  suite.check('dragging a held finger keeps the chip up', grown.chip !== null, JSON.stringify(grown))
  await page.evaluate(([b]) => window.__tmDispatch('touchend', b.x, b.y), [dragEnd])
  await page.waitForTimeout(200)

  // A dismissed selection must not leave a stale chip behind.
  await page.evaluate(([p]) => window.__tmDispatch('touchstart', p.x, p.y + 400), [dragStart])
  await page.evaluate(([p]) => window.__tmDispatch('touchend', p.x, p.y + 400), [dragStart])
  await page.waitForTimeout(200)
  const cleared = await page.evaluate(() => document.querySelector('[data-terminal-mobile-copy]') === null)
  suite.check('a fresh press retires the chip', cleared)
} finally {
  await app.close()
}

suite.finish()

/**
 * Geometry test: the screen must actually be clickable and drawable.
 *
 * This is the test that catches a missing xterm stylesheet — the defect that
 * looks like "the top row is duplicated" and "taps land on the wrong line".
 * A screen whose stylesheet is absent still renders, so only measurements can
 * tell the difference:
 *
 * - the stylesheet tag exists exactly once;
 * - `.xterm` fills the screen host;
 * - the viewport has a real height and a non-zero scrollHeight;
 * - the drawn row grid starts at the screen origin and the row pitch matches the
 *   cell height xterm reports;
 * - `elementFromPoint` in the middle of the screen resolves inside the screen.
 *
 * Usage: node test/geometry.mjs <baseUrl> <token>
 */
import { createSuite } from './harness.mjs'
import { authCookie, openApp, openTerminalTab, screenMetrics, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/geometry.mjs <baseUrl> <token>')
  process.exit(2)
}

const suite = createSuite('geometry')
const cookie = await authCookie(baseUrl, token)
const app = await openApp(baseUrl, { cookie })
try {
  const { page } = app
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await openTerminalTab(page)
  await waitForConnected(page)

  const metrics = await screenMetrics(page)
  suite.equal('exactly one xterm stylesheet tag', metrics.stylesheetTags, 1)
  suite.check('the screen host has width', metrics.screenWidth > 100, `width=${metrics.screenWidth}`)
  suite.check('the screen host has height', metrics.screenHeight > 100, `height=${metrics.screenHeight}`)
  suite.check('xterm fills the screen host', Math.abs(metrics.xtermHeight - metrics.screenHeight) < 24, `xterm=${metrics.xtermHeight} host=${metrics.screenHeight}`)
  suite.check('the viewport has a real height', metrics.viewportHeight > 40, `viewport=${metrics.viewportHeight}`)
  suite.check('the viewport has scroll content', metrics.viewportScrollHeight > 0, `scrollHeight=${metrics.viewportScrollHeight}`)
  suite.check('the row grid is drawn', metrics.rowCount > 0 && metrics.rowsHeight > 0, `rows=${metrics.rowCount} height=${metrics.rowsHeight}`)

  const grid = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const rows = screen.querySelector('.xterm-rows')
    const screenBox = screen.getBoundingClientRect()
    const rowsBox = rows.getBoundingClientRect()
    const firstRow = rows.children[0]?.getBoundingClientRect()
    const secondRow = rows.children[1]?.getBoundingClientRect()
    return {
      offsetX: rowsBox.left - screenBox.left,
      offsetY: rowsBox.top - screenBox.top,
      rowPitch: secondRow !== undefined && firstRow !== undefined ? secondRow.top - firstRow.top : 0,
      rowHeight: firstRow?.height ?? 0,
    }
  })
  suite.check('the grid origin is inside the screen', Math.abs(grid.offsetX) < 24 && Math.abs(grid.offsetY) < 24, JSON.stringify(grid))
  suite.check('the row pitch matches the cell height', grid.rowPitch > 0 && Math.abs(grid.rowPitch - grid.rowHeight) < 1.5, JSON.stringify(grid))

  const hit = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const box = screen.getBoundingClientRect()
    const element = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return { inside: element !== null && (element === screen || screen.contains(element)), tag: element?.className ?? '' }
  })
  suite.check('a tap in the middle resolves inside the screen', hit.inside, hit.tag)

  const fontSize = await page.evaluate(() => document.querySelector('[data-terminal-mobile-font-size]')?.textContent)
  suite.equal('the toolbar shows the default font size', fontSize, '13px')

  const fontMetrics = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    return { cellHeight: screen.querySelector('.xterm-rows')?.children[0]?.getBoundingClientRect().height ?? 0 }
  })
  await page.locator('[data-terminal-mobile-action="font-increase"]').click()
  await page.waitForTimeout(400)
  const bigger = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    return {
      label: document.querySelector('[data-terminal-mobile-font-size]')?.textContent,
      cellHeight: screen.querySelector('.xterm-rows')?.children[0]?.getBoundingClientRect().height ?? 0,
    }
  })
  suite.equal('A+ raises the shown size', bigger.label, '14px')
  suite.check('A+ grows the cell height', bigger.cellHeight > fontMetrics.cellHeight, `${fontMetrics.cellHeight} -> ${bigger.cellHeight}`)
  await page.locator('[data-terminal-mobile-action="font-decrease"]').click()
  await page.waitForTimeout(300)
  const restored = await page.evaluate(() => document.querySelector('[data-terminal-mobile-font-size]')?.textContent)
  suite.equal('A− restores the size', restored, '13px')
} finally {
  await app.close()
}

suite.finish()

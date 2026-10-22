/**
 * Key-bar layout test: adding keys must never hide keys.
 *
 * The original defect this locks down: the bar used `overflow-x`, so a newly
 * added custom key landed off-screen behind a hidden scrollbar and read as "my
 * configuration disappeared". The bar must WRAP into multiple rows and stay
 * within the viewport, and the editor must accept typing while the terminal is
 * live.
 *
 * Usage: node test/wrap.mjs <baseUrl> <token>
 */
import { createSuite } from './harness.mjs'
import { PHONE, authCookie, openApp, openTerminalTab, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/wrap.mjs <baseUrl> <token>')
  process.exit(2)
}

const suite = createSuite('wrap')
const cookie = await authCookie(baseUrl, token)
const app = await openApp(baseUrl, { cookie, viewport: PHONE, touch: true })
const { page } = app

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await openTerminalTab(page)
  await waitForConnected(page)

  const measureBar = () =>
    page.evaluate(() => {
      const bar = document.querySelector('[data-terminal-mobile-keybar]')
      if (bar === null) return undefined
      const box = bar.getBoundingClientRect()
      const keys = [...bar.querySelectorAll('button')].map((key) => {
        const rect = key.getBoundingClientRect()
        return { id: key.getAttribute('data-terminal-mobile-key') ?? key.getAttribute('data-terminal-mobile-custom-key') ?? key.textContent, top: rect.top, right: rect.right, bottom: rect.bottom }
      })
      return {
        scrollWidth: bar.scrollWidth,
        clientWidth: bar.clientWidth,
        height: box.height,
        top: box.top,
        bottom: box.bottom,
        rowCount: new Set(keys.map((key) => Math.round(key.top))).size,
        keyCount: keys.length,
        maxRight: Math.max(...keys.map((key) => key.right)),
        minTop: Math.min(...keys.map((key) => key.top)),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }
    })

  const initial = await measureBar()
  suite.check('the bar exists', initial !== undefined)
  suite.check('the bar has no horizontal overflow at rest', initial.scrollWidth <= initial.clientWidth + 1, JSON.stringify(initial))
  suite.check('every key sits inside the bar width', initial.maxRight <= initial.viewportWidth + 1, JSON.stringify(initial))
  suite.check('the bar sits inside the viewport', initial.bottom <= initial.viewportHeight + 1, JSON.stringify(initial))

  // ── the editor accepts typing while the terminal is live ──────────────────
  await page.locator('[data-terminal-mobile-action="keybar-edit"]').click()
  await page.waitForSelector('[data-terminal-mobile-editor]', { timeout: 10_000 })

  const dialog = page.locator('[role="dialog"]').first()
  const dialogBox = await dialog.boundingBox()
  suite.check('the editor fits the phone viewport', dialogBox !== null && dialogBox.width <= PHONE.width, JSON.stringify(dialogBox))

  // Add enough custom keys to force several rows. The dialog's content region
  // scrolls, so the add button has to be scrolled into view first — a phone
  // screen cannot show 45 builtin checkboxes plus eight custom rows at once.
  // Each row needs a label: a wholly blank row is deliberately NOT persisted
  // (it is an empty editor row, not a key), so eight untouched rows would be
  // gone after a reload by design.
  const addButton = page.locator('[role="dialog"] button').filter({ hasText: /add a key|添加按键/i }).first()
  for (let index = 0; index < 8; index += 1) {
    await addButton.scrollIntoViewIfNeeded()
    await addButton.click()
    await page.waitForTimeout(120)
  }
  const rows = page.locator('[data-terminal-mobile-custom-row]')
  suite.equal('all custom rows were added', await rows.count(), 8)
  for (let index = 0; index < 8; index += 1) {
    const label = rows.nth(index).locator('input').first()
    await label.scrollIntoViewIfNeeded()
    await label.fill(`K${index + 1}`)
    await page.waitForTimeout(60)
  }

  // Type into the LAST row: the focus-stealing bug showed up here, because the
  // terminal's onData focus() would pull the caret out of this input.
  const lastLabel = rows.last().locator('input').first()
  await lastLabel.fill('')
  await lastLabel.click()
  await lastLabel.type('K8', { delay: 40 })
  suite.equal('typing lands in the last custom row', await lastLabel.inputValue(), 'K8')
  const lastSend = rows.last().locator('input').nth(1)
  await lastSend.click()
  await lastSend.fill('\\e[8~')
  suite.equal('the payload input also keeps focus', await lastSend.inputValue(), '\\e[8~')

  // Also uncheck a default key: the bar behind the dialog must follow.
  await page.locator('[role="dialog"] label').filter({ hasText: /^tilde$|^~$/i }).first().click().catch(() => {})
  await page.waitForTimeout(300)

  await page.locator('[role="dialog"] button').filter({ hasText: /done|完成/i }).click()
  await page.waitForTimeout(500)

  const many = await measureBar()
  suite.check('eight custom keys produce several rows', many.rowCount >= 3, JSON.stringify({ rows: many.rowCount, keys: many.keyCount }))
  suite.check('the wrapped bar still has no horizontal overflow', many.scrollWidth <= many.clientWidth + 1, JSON.stringify(many))
  suite.check('no key is pushed past the right edge', many.maxRight <= many.viewportWidth + 1, JSON.stringify(many))
  suite.check('the bar stays on screen', many.bottom <= many.viewportHeight + 1, JSON.stringify(many))
  suite.check('the bar grew but is capped', many.height < PHONE.height * 0.45, JSON.stringify({ height: many.height }))
  suite.check('the screen still has room', await page.evaluate(() => (document.querySelector('[data-sidebar-terminal-screen]')?.clientHeight ?? 0) > 80))

  // ── the layout survives a reload ─────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await waitForConnected(page)
  const afterReload = await measureBar()
  suite.equal('every key survives a reload', afterReload.keyCount, many.keyCount)
  suite.check('the wrapped layout survives a reload', afterReload.rowCount >= 3, JSON.stringify(afterReload))
  suite.check('no horizontal overflow after reload', afterReload.scrollWidth <= afterReload.clientWidth + 1, JSON.stringify(afterReload))

  const customLabels = await page.evaluate(() =>
    [...document.querySelectorAll('[data-terminal-mobile-custom-key]')].map((button) => button.textContent),
  )
  suite.check('the custom labels render on the bar', customLabels.filter((label) => label === 'K8').length === 1, JSON.stringify(customLabels))
} finally {
  await app.close()
}

suite.finish()

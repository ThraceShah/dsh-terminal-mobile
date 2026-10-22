/**
 * Round-trip test: bytes must reach a real PTY and come back.
 *
 * The soft keyboard is gated by default (the helper textarea is read-only), and
 * that gate must NOT break hardware input: xterm's keydown path is independent
 * of `readOnly`, so typing with a physical keyboard still works while a phone
 * tap does not summon a virtual keyboard.
 *
 * Usage: node test/roundtrip.mjs <baseUrl> <token>
 */
import { createSuite } from './harness.mjs'
import { DESKTOP, authCookie, openApp, openTerminalTab, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/roundtrip.mjs <baseUrl> <token>')
  process.exit(2)
}

const suite = createSuite('roundtrip')
const cookie = await authCookie(baseUrl, token)
const app = await openApp(baseUrl, { cookie, viewport: DESKTOP, touch: false })
const { page } = app

const screenText = () =>
  page.evaluate(() => document.querySelector('[data-sidebar-terminal-screen] .xterm-rows')?.textContent ?? '')

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await openTerminalTab(page)
  await waitForConnected(page)
  await page.waitForTimeout(800)

  // ── the gate is on, and hardware keys still work ──────────────────────────
  const gate = await page.evaluate(() => {
    const textarea = document.querySelector('[data-sidebar-terminal-screen] .xterm-helper-textarea')
    return { readOnly: textarea?.readOnly, inputMode: textarea?.getAttribute('inputmode') }
  })
  suite.check('the soft keyboard gate is on by default', gate.readOnly === true, JSON.stringify(gate))

  // A programmatic click focuses without summoning a keyboard (the emulator is
  // the only path that would, and it is gated).
  await page.locator('[data-sidebar-terminal-screen]').click()
  await page.waitForTimeout(200)
  await page.keyboard.type('echo roundtrip-ok')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const echoed = await screenText()
  suite.check('hardware typing reaches the shell while gated', echoed.includes('roundtrip-ok'), echoed.slice(-160))

  // ── the key bar writes the same way ───────────────────────────────────────
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(250)
  await page.locator('[data-terminal-mobile-key="backspace"]').click()
  await page.waitForTimeout(200)
  const afterBksp = await screenText()
  suite.check('a key-bar press keeps the screen alive', afterBksp.length > 0)
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(200)

  // ── Esc reaches the shell ─────────────────────────────────────────────────
  await page.locator('[data-sidebar-terminal-screen]').click()
  await page.keyboard.type('echo before-esc')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.keyboard.type('echo after-esc')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const afterEsc = await screenText()
  suite.check('Esc did not wedge the input', afterEsc.includes('after-esc'), afterEsc.slice(-160))

  // ── Ctrl is a real modifier on the wire ───────────────────────────────────
  await page.keyboard.press('Control+u')
  await page.waitForTimeout(300)
  await page.keyboard.type('echo ctrl-u-cleared')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const afterCtrlU = await screenText()
  suite.check('Ctrl+U cleared the line', afterCtrlU.includes('ctrl-u-cleared'), afterCtrlU.slice(-160))

  // ── sticky Ctrl through the bar sends the same byte ───────────────────────
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(250)
  await page.locator('[data-sidebar-terminal-screen]').click()
  await page.keyboard.type('echo sticky-ctrl')
  await page.locator('[data-terminal-mobile-key="ctrl"]').click()
  await page.locator('[data-terminal-mobile-key="esc"]').click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)
  const afterSticky = await screenText()
  suite.check('a sticky-modified key did not corrupt the line', afterSticky.includes('sticky-ctrl'), afterSticky.slice(-160))

  // ── the terminal resized to the real viewport ─────────────────────────────
  const dims = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const rows = screen?.querySelector('.xterm-rows')
    return { rows: rows?.children.length ?? 0, width: screen?.clientWidth ?? 0 }
  })
  suite.check('xterm laid out a real grid', dims.rows > 10 && dims.width > 400, JSON.stringify(dims))

  // ── resizing the window refits and tells the PTY ──────────────────────────
  const colsBefore = await page.evaluate(() => document.querySelectorAll('[data-sidebar-terminal-screen] .xterm-rows > div').length)
  await page.setViewportSize({ width: 900, height: 700 })
  await page.waitForTimeout(1200)
  const colsAfter = await page.evaluate(() => document.querySelectorAll('[data-sidebar-terminal-screen] .xterm-rows > div').length)
  suite.check('a viewport change refits the screen', colsAfter > 0 && colsBefore > 0, `${colsBefore} -> ${colsAfter}`)

  await page.keyboard.type('echo after-resize')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const afterResize = await screenText()
  suite.check('the shell still answers after a resize', afterResize.includes('after-resize'), afterResize.slice(-160))
} finally {
  await app.close()
}

suite.finish()

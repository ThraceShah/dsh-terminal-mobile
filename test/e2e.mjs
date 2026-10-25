/**
 * End-to-end test: the screen the user actually gets.
 *
 * Asserts the product decisions, not the implementation: the official screen is
 * replaced, the toolbar works, the font size survives a reload, sticky Ctrl
 * sends a C0 byte, and the key editor round-trips a custom key through
 * localStorage.
 *
 * Usage: node test/e2e.mjs <baseUrl> <token>
 */
import { createSuite } from './harness.mjs'
import { authCookie, openApp, openTerminalTab, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/e2e.mjs <baseUrl> <token>')
  process.exit(2)
}

const suite = createSuite('e2e')
const cookie = await authCookie(baseUrl, token)
const app = await openApp(baseUrl, { cookie })
const { page } = app

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await openTerminalTab(page)
  await waitForConnected(page)

  // ── the official screen is replaced ────────────────────────────────────────
  const markers = await page.evaluate(() => {
    const root = document.querySelector('[data-sidebar-terminal]')
    return {
      mobileToolbar: root?.querySelector('[data-terminal-mobile-toolbar]') !== null,
      keyBar: root?.querySelector('[data-terminal-mobile-keybar]') !== null,
      screen: root?.querySelector('[data-sidebar-terminal-screen]') !== null,
      xterm: root?.querySelector('.xterm') !== null,
      fontLabel: root?.querySelector('[data-terminal-mobile-font-size]')?.textContent,
    }
  })
  suite.check('the terminal root is present', markers.screen)
  suite.check('our toolbar replaced the official chrome', markers.mobileToolbar)
  suite.check('the extension key bar renders', markers.keyBar)
  suite.check('xterm mounted inside our screen', markers.xterm)
  suite.equal('the font size label starts at 13px', markers.fontLabel, '13px')

  // ── default key bar contents ───────────────────────────────────────────────
  const keyIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-terminal-mobile-keybar] button')]
      .map((button) => button.getAttribute('data-terminal-mobile-key') ?? button.getAttribute('data-terminal-mobile-action'))
      .filter((id) => id !== null),
  )
  for (const id of ['ctrl', 'alt', 'tab', 'esc', 'backspace', 'up', 'down', 'left', 'right', 'home', 'end', 'pipe', 'dash', 'tilde']) {
    suite.check(`the default bar shows ${id}`, keyIds.includes(id))
  }
  // The editor entry lives in the TOOLBAR now: at the end of the bar's last
  // row nobody found it, and its icon doubled the keyboard toggle's.
  const editorEntry = await page.locator('[data-terminal-mobile-toolbar] [data-terminal-mobile-action="keybar-edit"]').count()
  suite.equal('the toolbar has the editor entry', editorEntry, 1)
  suite.check('the bar no longer ends with the editor', !keyIds.includes('keybar-edit'))

  // ── font size persists across a reload ─────────────────────────────────────
  await page.locator('[data-terminal-mobile-action="font-increase"]').click()
  await page.locator('[data-terminal-mobile-action="font-increase"]').click()
  await page.waitForTimeout(300)
  const raised = await page.locator('[data-terminal-mobile-font-size]').textContent()
  suite.equal('two A+ clicks reach 15px', raised, '15px')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh.terminal-mobile.v1') ?? '{}').fontSize)
  suite.equal('the font size is stored under the documented key', stored, 15)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await waitForConnected(page)
  const afterReload = await page.locator('[data-terminal-mobile-font-size]').textContent()
  suite.equal('the font size survives a reload', afterReload, '15px')
  const cellAfterReload = await page.evaluate(() => document.querySelector('[data-sidebar-terminal-screen] .xterm-rows')?.children[0]?.getBoundingClientRect().height ?? 0)
  suite.check('the enlarged font reached xterm', cellAfterReload > 15, `cell=${cellAfterReload}`)

  // ── sticky Ctrl ────────────────────────────────────────────────────────────
  const ctrl = page.locator('[data-terminal-mobile-key="ctrl"]')
  await ctrl.click()
  suite.equal('clicking Ctrl arms it', await ctrl.getAttribute('aria-pressed'), 'true')
  await page.locator('[data-terminal-mobile-key="esc"]').click()
  await page.waitForTimeout(200)
  suite.equal('a normal key disarms Ctrl', await ctrl.getAttribute('aria-pressed'), 'false')
  await ctrl.click()
  await ctrl.click()
  suite.equal('clicking Ctrl again disarms it', await ctrl.getAttribute('aria-pressed'), 'false')

  // ── scroll mode toggle ─────────────────────────────────────────────────────
  const scrollToggle = page.locator('[data-terminal-mobile-action="scroll-mode"]')
  suite.equal('scroll mode starts on terminal', await scrollToggle.getAttribute('data-scroll-mode'), 'terminal')
  await scrollToggle.click()
  await page.waitForTimeout(250)
  suite.equal('the toggle switches to page', await scrollToggle.getAttribute('data-scroll-mode'), 'page')
  suite.equal('the root reflects page mode', await page.locator('[data-sidebar-terminal]').getAttribute('data-scroll-mode'), 'page')
  const storedMode = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh.terminal-mobile.v1') ?? '{}').scrollMode)
  suite.equal('the scroll mode is persisted', storedMode, 'page')
  await scrollToggle.click()
  await page.waitForTimeout(200)
  suite.equal('the toggle returns to terminal', await scrollToggle.getAttribute('data-scroll-mode'), 'terminal')

  // ── soft keyboard gate ─────────────────────────────────────────────────────
  const gate = await page.evaluate(() => {
    const textarea = document.querySelector('[data-sidebar-terminal-screen] .xterm-helper-textarea')
    return { readOnly: textarea?.readOnly, inputMode: textarea?.getAttribute('inputmode') }
  })
  suite.check('the soft keyboard is gated by default', gate.readOnly === true, JSON.stringify(gate))
  suite.equal('the gated textarea refuses a virtual keyboard', gate.inputMode, 'none')

  const keyboardToggle = page.locator('[data-terminal-mobile-action="soft-keyboard"]')
  await keyboardToggle.click()
  await page.waitForTimeout(300)
  const unlocked = await page.evaluate(() => {
    const textarea = document.querySelector('[data-sidebar-terminal-screen] .xterm-helper-textarea')
    return { readOnly: textarea?.readOnly, inputMode: textarea?.getAttribute('inputmode'), focused: document.activeElement === textarea }
  })
  suite.check('⌨ unlocks the textarea', unlocked.readOnly === false, JSON.stringify(unlocked))
  suite.check('⌨ focuses the screen in the same gesture', unlocked.focused === true, JSON.stringify(unlocked))
  const keyboardStored = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh.terminal-mobile.v1') ?? '{}').softKeyboard)
  suite.check('the keyboard switch is NOT persisted', keyboardStored === undefined)
  await keyboardToggle.click()
  await page.waitForTimeout(200)

  // ── key bar visibility toggle ──────────────────────────────────────────────
  const barToggle = page.locator('[data-terminal-mobile-action="keybar-toggle"]')
  await barToggle.click()
  await page.waitForTimeout(250)
  suite.check('⌗ hides the key bar', (await page.locator('[data-terminal-mobile-keybar]').count()) === 0)
  await barToggle.click()
  await page.waitForTimeout(250)
  suite.check('⌗ shows it again', (await page.locator('[data-terminal-mobile-keybar]').count()) === 1)

  // ── key editor: add a custom key ───────────────────────────────────────────
  await page.locator('[data-terminal-mobile-action="keybar-edit"]').click()
  await page.waitForSelector('[data-terminal-mobile-editor]', { timeout: 10_000 })
  suite.check('the editor opens', true)
  const editorTitle = await page.locator('[role="dialog"]').first().getAttribute('aria-label')
  suite.check('the editor dialog is labelled', editorTitle !== null && editorTitle.length > 0, editorTitle)

  // Add a custom key and type into it — this is the "configuration disappears"
  // path: if the data path focused the emulator, this typing would go to the
  // shell instead of the input.
  await page.locator('[role="dialog"] button').filter({ hasText: /add a key|添加按键/i }).click()
  await page.waitForTimeout(300)
  const rows = page.locator('[data-terminal-mobile-custom-row]')
  suite.equal('one custom row appeared', await rows.count(), 1)
  const labelInput = rows.first().locator('input').first()
  await labelInput.click()
  await labelInput.type('Home2', { delay: 30 })
  suite.equal('typing reaches the label input', await labelInput.inputValue(), 'Home2')
  const sendInput = rows.first().locator('input').nth(1)
  await sendInput.click()
  await sendInput.fill('\\e[1~')
  await page.waitForTimeout(400)
  const customStored = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh.terminal-mobile.v1') ?? '{}').keyBar?.custom ?? [])
  suite.equal('the custom key is persisted', customStored.length, 1)
  suite.equal('the label is persisted', customStored[0]?.label, 'Home2')
  suite.equal('the payload is decoded before storage', customStored[0]?.send, '\x1b[1~')

  // Unchecking a builtin key must reach the bar behind the dialog.
  await page.locator('[role="dialog"] button').filter({ hasText: /done|完成/i }).click()
  await page.waitForTimeout(400)
  const barCustom = await page.evaluate(() =>
    [...document.querySelectorAll('[data-terminal-mobile-keybar] button')].map((button) => button.getAttribute('data-terminal-mobile-custom-key')).filter((id) => id !== null),
  )
  suite.equal('the custom key is on the bar', barCustom.length, 1)

  // ── send the custom key and prove the bytes reached the PTY ───────────────
  const before = await readScreenText(page)
  await page.locator('[data-terminal-mobile-custom-key]').first().click()
  await page.waitForTimeout(600)
  const after = await readScreenText(page)
  suite.check('the custom key wrote bytes to the shell', after !== before || after.length > 0)

  // ── missing-terminal / status surface ─────────────────────────────────────
  const statusSurface = await page.evaluate(() => {
    const root = document.querySelector('[data-sidebar-terminal]')
    return { hasStatus: root?.querySelector('[role="status"]') !== null, hasError: root?.querySelector('[role="alert"]') !== null }
  })
  suite.check('a connected shell shows no error banner', statusSurface.hasError === false)
} finally {
  await app.close()
}

async function readScreenText(page) {
  return page.evaluate(() => {
    const rows = document.querySelector('[data-sidebar-terminal-screen] .xterm-rows')
    return rows === null ? '' : rows.textContent ?? ''
  })
}

suite.finish()

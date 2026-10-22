/**
 * Frame-capture test: the diagnostic switch must be off by default and bounded
 * when on.
 *
 * The switch is what turns "the screen looks wrong" into "here are the exact
 * frames the Host sent". A capture that runs by default would keep the whole
 * scrollback alive in memory on a phone.
 *
 * Usage: node test/capture.mjs <baseUrl> <token>
 */
import { createSuite } from './harness.mjs'
import { authCookie, openApp, openTerminalTab, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/capture.mjs <baseUrl> <token>')
  process.exit(2)
}

const suite = createSuite('capture')
const cookie = await authCookie(baseUrl, token)

// ── default: nothing is captured, no global is installed ────────────────────
{
  const app = await openApp(baseUrl, { cookie })
  try {
    const { page } = app
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
    await waitForShell(page)
    await openTerminalTab(page)
    await waitForConnected(page)
    await page.waitForTimeout(1200)
    const state = await page.evaluate(() => ({
      global: typeof window.__dshTerminalMobileCapture,
      stored: localStorage.getItem('dsh.terminal-mobile.debug'),
    }))
    suite.equal('the capture global is absent by default', state.global, 'undefined')
    suite.check('the debug switch is not written by the plugin', state.stored === null, String(state.stored))
  } finally {
    await app.close()
  }
}

// ── enabled: frames are recorded, bounded, and reachable ───────────────────
{
  const app = await openApp(baseUrl, { cookie })
  try {
    const { page } = app
    await page.addInitScript(() => {
      localStorage.setItem('dsh.terminal-mobile.debug', '1')
    })
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
    await waitForShell(page)
    await openTerminalTab(page)
    await waitForConnected(page)
    await page.waitForTimeout(1500)

    const captured = await page.evaluate(() => {
      const capture = window.__dshTerminalMobileCapture
      return capture === undefined
        ? undefined
        : { enabled: capture.enabled, count: capture.frames.length, first: capture.frames[0], keys: Object.keys(capture) }
    })
    suite.check('the capture global appears when enabled', captured !== undefined)
    suite.check('the capture reports itself enabled', captured?.enabled === true)
    suite.check('at least one frame was recorded', (captured?.count ?? 0) > 0, JSON.stringify(captured?.count))
    suite.check('a frame records its revision and type', typeof captured?.first?.revision === 'number' && typeof captured?.first?.type === 'string', JSON.stringify(captured?.first))
    suite.check('a frame records when it arrived', typeof captured?.first?.at === 'number')

    // Bounded: a long burst of output must not grow the ring past its limit.
    await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
    await page.waitForTimeout(250)
    await page.locator('[data-sidebar-terminal-screen]').click()
    await page.keyboard.type('seq 1 400')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3000)
    const bounded = await page.evaluate(() => window.__dshTerminalMobileCapture?.frames.length ?? 0)
    suite.check('the ring stays bounded under heavy output', bounded <= 200, `frames=${bounded}`)

    const cleared = await page.evaluate(() => {
      window.__dshTerminalMobileCapture.clear()
      return window.__dshTerminalMobileCapture.frames.length
    })
    suite.equal('clear empties the ring', cleared, 0)
  } finally {
    await app.close()
  }
}

suite.finish()

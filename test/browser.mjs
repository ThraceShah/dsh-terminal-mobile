/**
 * Shared browser harness for the GUI tests.
 *
 * Each test receives a base URL of a running `dsh web` (a fresh profile per
 * verification round — the terminal quota is per session, so reusing one home
 * across rounds runs into `terminalLimit` and looks like a product bug).
 *
 * The cookie is minted from the server's own printed token, exactly as a person
 * opening the printed URL would: the cookie is authority-bound, so a cookie from
 * a different home/port is worthless.
 */
import { chromium } from 'playwright'

export const PHONE = { width: 390, height: 844 }
export const DESKTOP = { width: 1280, height: 800 }

/**
 * Open an authenticated page.
 * @param {string} baseUrl - `http://host:port` of the running server.
 * @param {object} [options]
 * @param {{name: string, value: string}} [options.cookie] - minted auth cookie.
 * @param {{width:number,height:number}} [options.viewport]
 * @param {boolean} [options.touch]
 * @returns {Promise<{browser, context, page, close}>}
 */
export async function openApp(baseUrl, options = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    viewport: options.viewport ?? PHONE,
    hasTouch: options.touch ?? true,
    isMobile: options.touch ?? true,
    deviceScaleFactor: 2,
    locale: 'en-US',
  })
  if (options.cookie !== undefined) {
    // The cookie NAME is authority-bound (`dsh-auth-` + sha256(authority)), so
    // it must come from the server's own Set-Cookie, never be reconstructed.
    await context.addCookies([
      {
        name: options.cookie.name,
        value: options.cookie.value,
        url: baseUrl,
        httpOnly: true,
        sameSite: 'Strict',
      },
    ])
  }
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`  [page] ${message.text()}`)
  })
  page.on('pageerror', (error) => console.error(`  [pageerror] ${error.message}`))
  return {
    browser,
    context,
    page,
    async close() {
      await context.close()
      await browser.close()
    },
  }
}

/**
 * Resolve the auth cookie for a test run.
 *
 * Two accepted sources, in order:
 * 1. `DSH_COOKIE` — a ready `name=value` pair. Needed for a server whose launch
 *    token is no longer available (the printed URL is only shown at startup).
 * 2. the printed `?token=` value, minted through the server's own Set-Cookie.
 *
 * @param {string} baseUrl
 * @param {string} [token]
 * @returns {Promise<{name: string, value: string}>}
 */
export async function authCookie(baseUrl, token) {
  const ready = process.env.DSH_COOKIE
  if (ready !== undefined && ready !== '') {
    const at = ready.indexOf('=')
    if (at > 0) return { name: ready.slice(0, at), value: ready.slice(at + 1) }
  }
  return mintCookie(baseUrl, token ?? '')
}

/**
 * Mint the auth cookie for a base URL through the launch token.
 * @param {string} baseUrl
 * @param {string} token
 * @returns {Promise<{name: string, value: string}>}
 */
export async function mintCookie(baseUrl, token) {
  const response = await fetch(`${baseUrl}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie === null) throw new Error('server did not mint an auth cookie; check the token')
  const [pair] = setCookie.split(';')
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1) }
}

/**
 * Wait for the shell to boot and the sidebar to be interactive.
 * @param {import('playwright').Page} page
 */
export async function waitForShell(page) {
  // The right sidebar is always in the DOM (a docked pane), but on a phone-width
  // viewport it starts collapsed and its guide cards are `aria-hidden`. Dismiss
  // any first-run dialog first, then open the sidebar.
  //
  // Onboarding dialogs can arrive AFTER the shell paints (a notice reads the
  // settings scope asynchronously), so the dismiss/open pair is retried rather
  // than attempted once: a dialog that appears mid-click swallows it, and the
  // failure then surfaces as an unrelated timeout much later.
  await page.waitForSelector('[data-sidebar-right-session]', { timeout: 60_000 })
  const expand = page.locator('[data-sidebar-right-expand]').first()
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await dismissDialogs(page)
    if (!(await expand.isVisible().catch(() => false))) break
    const expanded = await expand.click({ timeout: 5000 }).then(() => true).catch(() => false)
    if (!expanded) {
      await dismissDialogs(page)
      continue
    }
    await page.waitForTimeout(400)
    break
  }
  await dismissDialogs(page)
  const panel = page.locator('[data-sidebar-right-panel]').first()
  await panel.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
}

/**
 * Close first-run / onboarding dialogs.
 *
 * A notice dialog sits above the page and silently eats taps, which reads as
 * "the terminal does not respond" in every later assertion.
 * @param {import('playwright').Page} page
 */
export async function dismissDialogs(page) {
  // Onboarding is a SEQUENCE of dialogs on a fresh profile (preview notice,
  // then the API-key prompt), and each one silently eats taps on the page
  // underneath. Loop until none is left rather than dismissing one.
  const labels = /configure later|continue|close|got it|ok|skip|later|知道了|关闭|确定|稍后/i
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dialogs = page.locator('[role="dialog"]')
    if ((await dialogs.count()) === 0) return
    let clicked = false
    for (let index = 0; index < (await dialogs.count()); index += 1) {
      const button = dialogs.nth(index).locator('button').filter({ hasText: labels }).first()
      if ((await button.count()) > 0 && (await button.isEnabled().catch(() => false))) {
        await button.click({ timeout: 5000 }).catch(() => {})
        clicked = true
        break
      }
    }
    await page.waitForTimeout(400)
    if (clicked) continue
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
    if ((await page.locator('[role="dialog"]').count()) === 0) return
  }
  const remaining = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((dialog) => dialog.getAttribute('aria-label')))
  if (remaining.length > 0) console.error(`  [harness] dialogs still open: ${remaining.join(', ')}`)
}

/**
 * Open a terminal tab through the sidebar guide card.
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
export async function openTerminalTab(page) {
  const guide = page.locator('[data-sidebar-right-guide-entry="terminal"]').first()
  await guide.waitFor({ state: 'visible', timeout: 30_000 })
  await guide.click()
  await page.waitForSelector('[data-sidebar-terminal]', { timeout: 30_000 })
}

/**
 * Wait until the terminal screen reports a connected, writable shell.
 * @param {import('playwright').Page} page
 */
export async function waitForConnected(page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-sidebar-terminal]')
      if (root === null) return false
      const toolbar = root.querySelector('[data-terminal-mobile-toolbar]')
      const screen = root.querySelector('[data-sidebar-terminal-screen]')
      return toolbar !== null && screen !== null && screen.clientHeight > 40
    },
    undefined,
    { timeout: 60_000 },
  )
  // The Host caps terminals per Session (~8, exited ones included). Every test
  // that opens a tab consumes one, so a long verification round on one profile
  // eventually lands here — and every later assertion would fail for a reason
  // that has nothing to do with the plugin. Fail loudly with the remedy instead.
  const alert = await page.evaluate(() => document.querySelector('[data-sidebar-terminal] [role="alert"]')?.textContent ?? '')
  if (/terminalLimit|数量已达上限/i.test(alert)) {
    throw new Error(
      `${alert.trim()} — this DSH home has used its terminal quota. ` +
        'Restart the round with a FRESH DSH_HOME (one home per verification round); ' +
        'do not change the plugin to work around it.',
    )
  }
}

/** Read the extension key bar's geometry facts. */
export async function keyBarMetrics(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-terminal-mobile-keybar]')
    if (bar === null) return undefined
    const rect = bar.getBoundingClientRect()
    const keys = [...bar.querySelectorAll('button')].map((key) => {
      const box = key.getBoundingClientRect()
      return { id: key.getAttribute('data-terminal-mobile-key') ?? key.getAttribute('data-terminal-mobile-custom-key') ?? key.textContent, top: box.top, right: box.right, width: box.width }
    })
    const rows = new Set(keys.map((key) => Math.round(key.top)))
    return {
      width: rect.width,
      height: rect.height,
      scrollWidth: bar.scrollWidth,
      clientWidth: bar.clientWidth,
      rowCount: rows.size,
      keys,
      maxRight: Math.max(...keys.map((key) => key.right)),
    }
  })
}

/** Read xterm's own layout facts. */
export async function screenMetrics(page) {
  return page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const xterm = screen?.querySelector('.xterm')
    const viewport = screen?.querySelector('.xterm-viewport')
    const rows = screen?.querySelector('.xterm-rows')
    const styles = [...document.querySelectorAll('style')].filter((tag) => tag.hasAttribute('data-dsh-terminal-mobile-xterm-css'))
    return {
      screenWidth: screen?.clientWidth ?? 0,
      screenHeight: screen?.clientHeight ?? 0,
      xtermHeight: xterm?.getBoundingClientRect().height ?? 0,
      viewportHeight: viewport?.getBoundingClientRect().height ?? 0,
      viewportScrollHeight: viewport?.scrollHeight ?? 0,
      rowsHeight: rows?.getBoundingClientRect().height ?? 0,
      rowCount: rows?.children.length ?? 0,
      stylesheetTags: styles.length,
    }
  })
}

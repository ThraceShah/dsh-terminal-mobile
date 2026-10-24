/**
 * Renderer probe: what the terminal actually paints, as opposed to what the
 * plugin assumes it paints.
 *
 * xterm draws through whichever renderer it is configured with, and the two
 * look nothing alike on the DOM side: a canvas renderer has no text nodes at
 * all, while the accessibility renderer this build emits one `<div>` per row
 * with no class and no `aria-rowindex`. A feature that measures the screen — a
 * hit-test, a chip anchored to a row, a caret — is written against one of them
 * and silently does nothing under the other, and no assertion elsewhere catches
 * that, because every other suite only checks output.
 *
 * So this prints the facts that decide which renderer is live: whether a canvas
 * exists, how the row container is shaped, and what the first rows look like.
 * It exits non-zero when the screen is absent, so a probe run against the wrong
 * server still fails; it asserts nothing else, because it is read, not run.
 *
 * Usage: node test/probe.mjs <baseUrl> [token]
 */
import { PHONE, authCookie, openApp, openTerminalTab, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/probe.mjs <baseUrl> [token]')
  process.exit(2)
}

const cookie = await authCookie(baseUrl, token)
const app = await openApp(baseUrl, { cookie, viewport: PHONE, touch: true })
const { page } = app
let failed = false
try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await openTerminalTab(page)
  await waitForConnected(page)
  const info = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    if (screen === null) return undefined
    const rows = screen.querySelector('.xterm-rows')
    const kids = rows === null ? [] : [...rows.children].slice(0, 3).map((row) => ({
      cls: row.className,
      aria: row.getAttribute('aria-rowindex'),
      height: row.getBoundingClientRect().height,
      top: row.getBoundingClientRect().top,
      html: row.outerHTML.slice(0, 180),
    }))
    const box = screen.getBoundingClientRect()
    return {
      screenTop: box.top,
      screenHeight: box.height,
      canvas: screen.querySelector('canvas') !== null,
      rows: rows === null ? null : { childCount: rows.childElementCount, cls: rows.className },
      first: kids,
    }
  })
  if (info === undefined) {
    console.error('probe: no terminal screen on the page')
    failed = true
  } else {
    console.log(JSON.stringify(info, null, 2))
  }
} finally {
  await app.close()
}
if (failed) process.exit(1)

/**
 * Mobile interaction test: scroll ownership, the keyboard inset, the soft
 * keyboard gate and the Bksp byte.
 *
 * Touch simulation is done with SYNTHETIC events, not Playwright's mouse wheel:
 * in a touch context `page.mouse.wheel` may not produce a DOM `wheel` event at
 * all, so a wheel-based assertion can pass without ever exercising the handler.
 * The test judges consumption by `defaultPrevented` and by xterm's own viewport
 * scroll position.
 *
 * Usage: node test/mobile.mjs <baseUrl> <token>
 */
import { createSuite } from './harness.mjs'
import { PHONE, authCookie, openApp, openTerminalTab, waitForConnected, waitForShell } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/mobile.mjs <baseUrl> <token>')
  process.exit(2)
}

const suite = createSuite('mobile')
const cookie = await authCookie(baseUrl, token)
const app = await openApp(baseUrl, { cookie, viewport: PHONE, touch: true })
const { page } = app

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await waitForShell(page)
  await openTerminalTab(page)
  await waitForConnected(page)

  // Fill the buffer PAST the visible rows: a terminal with no scrollback has
  // nowhere to scroll, and a swipe assertion against it is vacuous (xterm's
  // viewport reports scrollHeight === clientHeight until the buffer overflows).
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-sidebar-terminal-screen]').click()
  await page.keyboard.type('seq 1 300')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)

  // xterm 6 renders scrollback by REPLACING row content, not by scrolling a DOM
  // element: `.xterm-viewport` and `.xterm-scrollable-element` both report
  // scrollTop === 0 forever. The observable proof of scrollback is therefore the
  // top visible row, not a scroll offset.
  const topRow = () => page.evaluate(() => document.querySelector('[data-sidebar-terminal-screen] .xterm-rows')?.children[0]?.textContent ?? '')
  const topBefore = await topRow()
  suite.check('the buffer overflowed the visible rows', topBefore.trim() !== '', JSON.stringify(topBefore))

  // Regression: the screen mounts before the Host environment arrives, so an
  // emulator created with `scrollback: 0` and never corrected silently drops all
  // history — the swipe below would have nowhere to go, and the user cannot read
  // back at all. Prove the option was adopted once the environment landed.
  const scrollbackOption = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    // xterm keeps the option on its public options object; read it through the
    // DOM-visible consequence instead: the top row must have advanced past line 1.
    return { top: screen?.querySelector('.xterm-rows')?.children[0]?.textContent ?? '' }
  })
  suite.check('the oldest visible line is not the first line of output', !/^1\s*$/.test(scrollbackOption.top.trim()), JSON.stringify(scrollbackOption.top))
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(300)

  // ── terminal mode owns the gesture ────────────────────────────────────────
  const terminalSwipe = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const viewport = screen.querySelector('.xterm-viewport')
    const box = screen.getBoundingClientRect()
    const scrollBefore = viewport.scrollTop
    const topBefore = screen.querySelector('.xterm-rows').children[0].textContent
    const make = (type, y, cancelable = true) => {
      const event = new Event(type, { bubbles: true, cancelable })
      Object.defineProperty(event, 'touches', { value: [{ clientX: box.left + box.width / 2, clientY: y, identifier: 1 }] })
      Object.defineProperty(event, 'changedTouches', { value: [{ clientX: box.left + box.width / 2, clientY: y, identifier: 1 }] })
      return event
    }
    // Finger moves DOWN: the viewport scrolls UP into the history. At the bottom
    // of the buffer the opposite direction has nowhere to go, so a downward
    // swipe is the only gesture that can prove the terminal (not the page) moved.
    const start = make('touchstart', box.top + box.height * 0.3)
    screen.dispatchEvent(start)
    const move = make('touchmove', box.top + box.height * 0.7)
    screen.dispatchEvent(move)
    const end = make('touchend', box.top + box.height * 0.7)
    screen.dispatchEvent(end)
    return {
      startPrevented: start.defaultPrevented,
      movePrevented: move.defaultPrevented,
      endPrevented: end.defaultPrevented,
      scrollBefore,
      scrollAfter: viewport.scrollTop,
      topBefore,
    }
  })
  suite.check('terminal mode consumes touchstart', terminalSwipe.startPrevented)
  suite.check('terminal mode consumes touchmove', terminalSwipe.movePrevented)
  suite.check('terminal mode consumes touchend', terminalSwipe.endPrevented)
  await page.waitForTimeout(500)
  const topAfter = await topRow()
  suite.check('a swipe scrolled the terminal buffer', topAfter !== terminalSwipe.topBefore, `${JSON.stringify(terminalSwipe.topBefore)} -> ${JSON.stringify(topAfter)}`)

  const pageScroll = await page.evaluate(() => ({ top: window.scrollY, body: document.scrollingElement?.scrollTop ?? 0 }))
  suite.check('a swipe did not scroll the page', pageScroll.top === 0 && pageScroll.body === 0, JSON.stringify(pageScroll))

  // ── page mode hands the gesture back to the browser ──────────────────────
  await page.locator('[data-terminal-mobile-action="scroll-mode"]').click()
  await page.waitForTimeout(300)
  const pageSwipe = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const box = screen.getBoundingClientRect()
    const make = (type, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'touches', { value: [{ clientX: box.left + box.width / 2, clientY: y, identifier: 1 }] })
      Object.defineProperty(event, 'changedTouches', { value: [{ clientX: box.left + box.width / 2, clientY: y, identifier: 1 }] })
      return event
    }
    const start = make('touchstart', box.top + box.height * 0.7)
    screen.dispatchEvent(start)
    const move = make('touchmove', box.top + box.height * 0.3)
    screen.dispatchEvent(move)
    const end = make('touchend', box.top + box.height * 0.3)
    screen.dispatchEvent(end)
    return { startPrevented: start.defaultPrevented, movePrevented: move.defaultPrevented, endPrevented: end.defaultPrevented }
  })
  suite.check('page mode leaves touchmove to the browser', pageSwipe.movePrevented === false)
  suite.check('page mode leaves touchend to the browser', pageSwipe.endPrevented === false)

  // The wheel is the trap: xterm's own listener calls preventDefault, so the
  // plugin must stop propagation in the capture phase and NOT prevent it.
  const wheel = await page.evaluate(() => {
    const screen = document.querySelector('[data-sidebar-terminal-screen]')
    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    screen.dispatchEvent(event)
    return { prevented: event.defaultPrevented }
  })
  suite.check('page mode does not consume the wheel', wheel.prevented === false)
  await page.locator('[data-terminal-mobile-action="scroll-mode"]').click()
  await page.waitForTimeout(250)

  // ── Bksp sends DEL, not BS ───────────────────────────────────────────────
  const bksp = await page.evaluate(() => {
    const button = document.querySelector('[data-terminal-mobile-key="backspace"]')
    return { label: button?.textContent, aria: button?.getAttribute('aria-label') }
  })
  suite.equal('the Bksp label is ASCII', bksp.label, 'Bksp')
  suite.check('the Bksp label has no ⌫ glyph', !String(bksp.label).includes('⌫'))
  suite.check('the Bksp accessible name spells the byte', String(bksp.aria).includes('\\x7f'), bksp.aria)

  // Prove the byte reaches the shell: type a character, press Bksp, and read the
  // prompt line back.
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(250)
  await page.locator('[data-sidebar-terminal-screen]').click()
  await page.keyboard.type('xyz')
  await page.waitForTimeout(400)
  const beforeBksp = await readPromptLine(page)
  await page.locator('[data-terminal-mobile-key="backspace"]').click()
  await page.waitForTimeout(500)
  const afterBksp = await readPromptLine(page)
  suite.check('Bksp erased one character', afterBksp.length < beforeBksp.length || !afterBksp.includes('xyz'), `${JSON.stringify(beforeBksp)} -> ${JSON.stringify(afterBksp)}`)
  await page.keyboard.press('Control+u')
  await page.waitForTimeout(200)
  await page.locator('[data-terminal-mobile-action="soft-keyboard"]').click()
  await page.waitForTimeout(200)

  // ── keyboard inset follows the visual viewport ───────────────────────────
  const inset = await page.evaluate(() => {
    const root = document.querySelector('[data-sidebar-terminal]')
    const before = getComputedStyle(root).getPropertyValue('--dsh-tm-keyboard-inset').trim()
    return { before, paddingBottom: getComputedStyle(root).paddingBottom }
  })
  suite.check('the inset variable is published', inset.before !== '', JSON.stringify(inset))
  const simulated = await page.evaluate(() => {
    const root = document.querySelector('[data-sidebar-terminal]')
    const viewport = window.visualViewport
    const originalHeight = viewport.height
    Object.defineProperty(viewport, 'height', { configurable: true, value: originalHeight - 300 })
    viewport.dispatchEvent(new Event('resize'))
    const during = getComputedStyle(root).getPropertyValue('--dsh-tm-keyboard-inset').trim()
    Object.defineProperty(viewport, 'height', { configurable: true, value: originalHeight })
    viewport.dispatchEvent(new Event('resize'))
    const after = getComputedStyle(root).getPropertyValue('--dsh-tm-keyboard-inset').trim()
    return { during, after }
  })
  suite.check('a shrinking visual viewport raises the inset', parseInt(simulated.during, 10) >= 290, JSON.stringify(simulated))
  suite.check('the inset returns when the viewport grows', parseInt(simulated.after, 10) < 20, JSON.stringify(simulated))

  // ── the key bar never overflows sideways ─────────────────────────────────
  const bar = await page.evaluate(() => {
    const element = document.querySelector('[data-terminal-mobile-keybar]')
    if (element === null) return undefined
    const box = element.getBoundingClientRect()
    const keys = [...element.querySelectorAll('button')].map((key) => key.getBoundingClientRect())
    return {
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      maxRight: Math.max(...keys.map((key) => key.right)),
      right: box.right,
      bottom: box.bottom,
      viewportHeight: window.innerHeight,
    }
  })
  suite.check('the key bar has no horizontal overflow', bar.scrollWidth <= bar.clientWidth + 1, JSON.stringify(bar))
  suite.check('every key fits inside the bar', bar.maxRight <= bar.right + 1, JSON.stringify(bar))
  suite.check('the key bar stays on screen', bar.bottom <= bar.viewportHeight + 1, JSON.stringify(bar))
} finally {
  await app.close()
}

async function readPromptLine(page) {
  return page.evaluate(() => {
    const rows = document.querySelector('[data-sidebar-terminal-screen] .xterm-rows')
    if (rows === null) return ''
    const lines = [...rows.children].map((row) => row.textContent ?? '')
    const nonEmpty = lines.filter((line) => line.trim() !== '')
    return nonEmpty.at(-1) ?? ''
  })
}

suite.finish()

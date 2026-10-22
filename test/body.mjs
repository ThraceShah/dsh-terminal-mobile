/**
 * Behaviour test of the screen module with a light DOM stand-in.
 *
 * What this covers that the pure-logic test cannot: the soft-keyboard gate, the
 * scroll ownership contract (which events are consumed, in which mode), the
 * keyboard inset math, and the frame-capture switch. These are the three
 * behaviours that broke silently in the original development session, so they
 * are asserted directly against the shipped modules rather than through a
 * browser.
 */
import { createSuite } from './harness.mjs'
import { applySoftKeyboardGate, focusScreen } from '../src/gate.js'
import { installScrollOwnership, screenHasSize } from '../src/scroll.js'
import { KEYBOARD_INSET_VARIABLE, installKeyboardInset, measureKeyboardInset } from '../src/viewport.js'
import { createFrameCapture, debugEnabled } from '../src/debug.js'
import { STYLES, installStyles } from '../src/styles.js'
import { ObservableState, clearSticky, consumeSticky, preferences, setCustomKeys, setFontSize, setKeyBarEnabled, setScrollMode, sticky, toggleSticky } from '../src/ui-state.js'
import { defaultSettings } from '../src/settings.js'

const suite = createSuite('body')

// ── soft-keyboard gate ────────────────────────────────────────────────────────
function fakeTerminal() {
  const textarea = {
    readOnly: false,
    attributes: {},
    getAttribute(name) {
      return textarea.attributes[name] ?? null
    },
    setAttribute(name, value) {
      textarea.attributes[name] = value
    },
    focusCount: 0,
    focus() {
      textarea.focusCount += 1
    },
  }
  return { textarea, focused: 0 }
}

{
  const terminal = fakeTerminal()
  applySoftKeyboardGate(terminal, true, false)
  suite.check('gated: textarea is read-only', terminal.textarea.readOnly === true)
  suite.equal('gated: inputmode is none', terminal.textarea.getAttribute('inputmode'), 'none')
}
{
  const terminal = fakeTerminal()
  applySoftKeyboardGate(terminal, false, false)
  suite.check('ungated: textarea is writable', terminal.textarea.readOnly === false)
  suite.equal('ungated: inputmode is text', terminal.textarea.getAttribute('inputmode'), 'text')
}
{
  const terminal = fakeTerminal()
  applySoftKeyboardGate(terminal, false, true)
  suite.check('read-only model locks even when the keyboard is requested', terminal.textarea.readOnly === true)
  suite.equal('read-only model also blocks inputmode', terminal.textarea.getAttribute('inputmode'), 'none')
}
{
  // xterm rewrites readOnly on every disableStdin change; the gate must win.
  const terminal = fakeTerminal()
  applySoftKeyboardGate(terminal, true, false)
  terminal.textarea.readOnly = false
  applySoftKeyboardGate(terminal, true, false)
  suite.check('the gate is re-asserted after an external write', terminal.textarea.readOnly === true)
}
{
  const terminal = fakeTerminal()
  terminal.focusCount = 0
  terminal.focus = () => {
    terminal.focusCount += 1
  }
  focusScreen(terminal)
  suite.equal('focusScreen focuses the emulator', terminal.focusCount, 1)
  const broken = {
    focus() {
      throw new Error('disposed')
    },
  }
  suite.check('focusScreen swallows a disposed emulator', (() => {
    focusScreen(broken)
    return true
  })())
  suite.check('focusScreen tolerates undefined', (() => {
    focusScreen(undefined)
    return true
  })())
}

// ── scroll ownership ──────────────────────────────────────────────────────────
function fakeNode() {
  const listeners = new Map()
  const node = {
    listeners,
    addEventListener(type, handler, options) {
      const list = listeners.get(type) ?? []
      list.push({ handler, options })
      listeners.set(type, list)
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? []
      listeners.set(
        type,
        list.filter((entry) => entry.handler !== handler),
      )
    },
    dispatch(type, event) {
      for (const entry of listeners.get(type) ?? []) entry.handler(event)
      return event
    },
    optionsFor(type) {
      return (listeners.get(type) ?? []).map((entry) => entry.options)
    },
  }
  return node
}

function fakeEvent(overrides = {}) {
  return {
    cancelable: true,
    defaultPrevented: false,
    propagationStopped: false,
    deltaY: 0,
    deltaMode: 0,
    touches: [],
    timeStamp: 0,
    preventDefault() {
      this.defaultPrevented = true
    },
    stopPropagation() {
      this.propagationStopped = true
    },
    ...overrides,
  }
}

function scrollHarness(mode) {
  const node = fakeNode()
  const calls = []
  const handle = installScrollOwnership({
    node,
    mode: () => mode,
    target: () => ({ scrollLines: (rows) => calls.push(rows) }),
    lineHeight: () => 17,
  })
  return { node, calls, handle }
}

{
  const { node, calls } = scrollHarness('terminal')
  const start = fakeEvent({ touches: [{ clientY: 200 }] })
  node.dispatch('touchstart', start)
  suite.check('terminal mode consumes touchstart', start.defaultPrevented && start.propagationStopped)
  const move = fakeEvent({ touches: [{ clientY: 166 }] })
  node.dispatch('touchmove', move)
  suite.check('terminal mode consumes touchmove', move.defaultPrevented && move.propagationStopped)
  suite.equal('34px at 17px/row scrolls 2 rows', calls, [2])
  // The remainder accumulates instead of being rounded away.
  const small = fakeEvent({ touches: [{ clientY: 160 }] })
  node.dispatch('touchmove', small)
  suite.equal('a 6px nudge is banked, not applied', calls, [2])
  const next = fakeEvent({ touches: [{ clientY: 145 }] })
  node.dispatch('touchmove', next)
  suite.equal('banked pixels combine into a row', calls, [2, 1])
}
{
  const { node, calls } = scrollHarness('page')
  const start = fakeEvent({ touches: [{ clientY: 200 }] })
  node.dispatch('touchstart', start)
  suite.check('page mode stops propagation on touchstart', start.propagationStopped)
  suite.check('page mode does NOT preventDefault on touchstart', start.defaultPrevented === false)
  const move = fakeEvent({ touches: [{ clientY: 100 }] })
  node.dispatch('touchmove', move)
  suite.check('page mode stops propagation on touchmove', move.propagationStopped)
  suite.check('page mode leaves the page scroll alone', move.defaultPrevented === false)
  suite.equal('page mode never scrolls the terminal', calls, [])
}
{
  const { node, calls } = scrollHarness('terminal')
  const wheel = fakeEvent({ deltaY: 34 })
  node.dispatch('wheel', wheel)
  suite.check('terminal mode consumes wheel', wheel.defaultPrevented && wheel.propagationStopped)
  suite.equal('wheel pixels convert to rows', calls, [2])
  const lineWheel = fakeEvent({ deltaY: 2, deltaMode: 1 })
  node.dispatch('wheel', lineWheel)
  suite.equal('line-mode wheel converts with the row height', calls, [2, 2])
  const zero = fakeEvent({ deltaY: 0 })
  node.dispatch('wheel', zero)
  suite.equal('a zero-delta wheel is ignored', calls, [2, 2])
}
{
  // The page-mode wheel case is the trap: xterm's own listener calls
  // preventDefault, so "doing nothing" freezes the page.
  const { node } = scrollHarness('page')
  const wheel = fakeEvent({ deltaY: 30 })
  node.dispatch('wheel', wheel)
  suite.check('page mode stops the wheel before xterm sees it', wheel.propagationStopped)
  suite.check('page mode never prevents the wheel default', wheel.defaultPrevented === false)
}
{
  const node = fakeNode()
  installScrollOwnership({ node, mode: () => 'terminal', target: () => undefined, lineHeight: () => 17 })
  node.dispatch('touchstart', fakeEvent({ touches: [{ clientY: 100 }] }))
  const move = fakeEvent({ touches: [{ clientY: 10 }] })
  node.dispatch('touchmove', move)
  suite.check('a missing target does not throw', move.defaultPrevented === true)
}
{
  const node = fakeNode()
  const calls = []
  installScrollOwnership({
    node,
    mode: () => 'terminal',
    target: () => ({ scrollLines: (rows) => calls.push(rows) }),
    lineHeight: () => 0,
    canScroll: () => false,
  })
  const wheel = fakeEvent({ deltaY: 34 })
  node.dispatch('wheel', wheel)
  suite.equal('canScroll=false blocks the gesture', calls, [])
  suite.check('canScroll=false does not consume the wheel', wheel.defaultPrevented === false)
}
{
  const { node, handle } = scrollHarness('terminal')
  handle.dispose()
  const move = fakeEvent({ touches: [{ clientY: 10 }] })
  node.dispatch('touchmove', move)
  suite.check('dispose removes every listener', node.listeners.get('touchmove')?.length === 0 && node.listeners.get('wheel')?.length === 0)
  suite.check('dispose makes the handler inert', move.defaultPrevented === false)
  suite.check('listeners are registered as non-passive', node.optionsFor('touchmove').every((options) => options?.passive === false))
  suite.check('listeners are capture-phase', node.optionsFor('wheel').every((options) => options?.capture === true))
}
{
  suite.check('screenHasSize rejects a zero-size node', screenHasSize({ clientWidth: 0, clientHeight: 10 }) === false)
  suite.check('screenHasSize accepts a laid-out node', screenHasSize({ clientWidth: 390, clientHeight: 400 }) === true)
  suite.check('screenHasSize rejects null', screenHasSize(null) === false)
}

// ── keyboard inset ────────────────────────────────────────────────────────────
{
  const previousWindow = globalThis.window
  globalThis.window = { innerHeight: 844, visualViewport: { height: 500, offsetTop: 0 } }
  suite.equal('inset is the occluded height', measureKeyboardInset(), 344)
  globalThis.window.visualViewport = { height: 500, offsetTop: 100 }
  suite.equal('inset accounts for the viewport offset', measureKeyboardInset(), 244)
  globalThis.window.visualViewport = { height: 900, offsetTop: 0 }
  suite.equal('a taller visual viewport yields zero', measureKeyboardInset(), 0)
  globalThis.window.visualViewport = undefined
  suite.equal('no visual viewport yields zero', measureKeyboardInset(), 0)
  globalThis.window = previousWindow
}
{
  const previousWindow = globalThis.window
  const element = {
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value
      },
      removeProperty(name) {
        delete this.values[name]
      },
    },
  }
  const viewport = { height: 600, offsetTop: 0, listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn) }, removeEventListener(type) { this.listeners.delete(type) } }
  globalThis.window = { innerHeight: 800, visualViewport: viewport, addEventListener() {}, removeEventListener() {} }
  let changes = 0
  const handle = installKeyboardInset(element, () => {
    changes += 1
  })
  suite.equal('inset variable is published', element.style.values[KEYBOARD_INSET_VARIABLE], '200px')
  suite.equal('the change callback fired once', changes, 1)
  viewport.height = 700
  viewport.listeners.get('resize')()
  suite.equal('a viewport resize republishes the inset', element.style.values[KEYBOARD_INSET_VARIABLE], '100px')
  suite.equal('the change callback fired again', changes, 2)
  viewport.height = 690
  viewport.listeners.get('resize')()
  suite.equal('an unchanged inset does not refit', changes, 3)
  handle.dispose()
  suite.check('dispose removes the variable', element.style.values[KEYBOARD_INSET_VARIABLE] === undefined)
  globalThis.window = previousWindow
}

// ── frame capture ─────────────────────────────────────────────────────────────
{
  const previousWindow = globalThis.window
  const previousStorage = globalThis.localStorage
  globalThis.window = {}
  globalThis.localStorage = { getItem: () => null }
  suite.check('debug is off by default', debugEnabled() === false)
  const capture = createFrameCapture(3)
  capture.push({ revision: 1 })
  suite.equal('a disabled capture keeps nothing', capture.frames.length, 0)
  globalThis.localStorage = { getItem: (key) => (key === 'dsh.terminal-mobile.debug' ? '1' : null) }
  suite.check('debug turns on with the documented key', debugEnabled() === true)
  const on = createFrameCapture(3)
  suite.check('an enabled capture is published on the window', globalThis.window.__dshTerminalMobileCapture === on)
  on.push({ revision: 1 })
  on.push({ revision: 2 })
  on.push({ revision: 3 })
  on.push({ revision: 4 })
  suite.equal('the ring is bounded', on.frames.length, 3)
  suite.equal('the newest frame is retained', on.frames[2].revision, 4)
  on.clear()
  suite.equal('clear empties the ring', on.frames.length, 0)
  globalThis.window = previousWindow
  globalThis.localStorage = previousStorage
}

// ── stylesheet ────────────────────────────────────────────────────────────────
suite.check('styles use the real alias tokens', STYLES.includes('--dsw-alias-bg-layer-1') && STYLES.includes('--dsw-alias-border-l2'))
suite.check('styles avoid the non-existent bg-l1/bg-l2 tokens', !STYLES.includes('--dsw-alias-bg-l1') && !STYLES.includes('--dsw-alias-bg-l2'))
suite.check('styles wrap the key bar instead of scrolling it sideways', STYLES.includes('.dsh-tm-keybar') && STYLES.includes('flex-wrap: wrap') && STYLES.includes('overflow-x: hidden'))
suite.check('styles cap the key bar height', STYLES.includes('max-height: 40vh'))
suite.check('styles consume the keyboard inset', STYLES.includes('var(--dsh-tm-keyboard-inset, 0px)'))
suite.check('styles switch touch-action by scroll mode', STYLES.includes("data-scroll-mode='page'] .dsh-tm-screen { touch-action: pan-y; }"))
{
  const installed = []
  const previousDocument = globalThis.document
  globalThis.document = {
    querySelector: () => (installed.length > 0 ? {} : null),
    createElement: () => ({
      setAttribute() {},
      textContent: '',
    }),
    head: { appendChild: (tag) => installed.push(tag) },
  }
  suite.check('installStyles creates one tag', installStyles() === true)
  suite.check('installStyles is idempotent', installStyles() === false)
  suite.equal('exactly one style tag exists', installed.length, 1)
  globalThis.document = previousDocument
}

// ── preference and sticky stores ──────────────────────────────────────────────
{
  const store = new ObservableState({ value: 1 })
  let notifications = 0
  const unsubscribe = store.subscribe(() => {
    notifications += 1
  })
  const first = store.getSnapshot()
  store.set(first)
  suite.equal('an identical snapshot does not notify', notifications, 0)
  store.set({ value: 2 })
  suite.equal('a new snapshot notifies once', notifications, 1)
  unsubscribe()
  store.set({ value: 3 })
  suite.equal('unsubscribe stops notifications', notifications, 1)
  suite.check('getSnapshot is reference-stable', store.getSnapshot() === store.getSnapshot())
}
{
  const before = preferences.getSnapshot()
  setFontSize(17)
  suite.equal('setFontSize persists', preferences.getSnapshot().fontSize, 17)
  setScrollMode('page')
  suite.equal('setScrollMode persists', preferences.getSnapshot().scrollMode, 'page')
  setKeyBarEnabled(false)
  suite.equal('setKeyBarEnabled persists', preferences.getSnapshot().keyBar.enabled, false)
  setCustomKeys([{ id: 'c1', label: 'X', send: 'x' }])
  suite.equal('setCustomKeys persists', preferences.getSnapshot().keyBar.custom.length, 1)
  setFontSize(before.fontSize)
  setScrollMode(before.scrollMode)
  setKeyBarEnabled(before.keyBar.enabled)
  setCustomKeys(before.keyBar.custom)
  suite.equal('defaults are restored', preferences.getSnapshot(), defaultSettings())
}
{
  clearSticky()
  toggleSticky('ctrl')
  suite.check('toggleSticky arms ctrl', sticky.getSnapshot().ctrl === true)
  suite.equal('consumeSticky applies ctrl', consumeSticky('a'), '\x01')
  suite.check('consumeSticky disarms ctrl', sticky.getSnapshot().ctrl === false)
  toggleSticky('ctrl')
  toggleSticky('alt')
  suite.equal('consumeSticky applies both', consumeSticky('a'), '\x1b\x01')
  suite.check('both disarm', sticky.getSnapshot().ctrl === false && sticky.getSnapshot().alt === false)
  toggleSticky('ctrl')
  suite.equal('a paste keeps the modifier armed', consumeSticky('hello'), 'hello')
  suite.check('the paste left ctrl armed', sticky.getSnapshot().ctrl === true)
  clearSticky()
  suite.check('clearSticky disarms everything', sticky.getSnapshot().ctrl === false && sticky.getSnapshot().alt === false)
}

suite.finish()

/**
 * Load-protocol test: the shipped artifacts must be loadable through the same
 * `window.__ModuleLoader__.load({ id, chunk?, factory })` contract the host
 * implements, must declare the right slot, and must not drift between the
 * locale dictionaries.
 */
import { artifact, createPage, createSuite, execute, jsxRuntimeStub, primitivesStub, reactStub } from './harness.mjs'

const suite = createSuite('load')

const entrySource = artifact('client.js')
const chunkSource = artifact('client.terminal-mobile.js')

// ── artifact shape ────────────────────────────────────────────────────────────
suite.check('entry wraps a ModuleLoader registration', entrySource.startsWith('window.__ModuleLoader__.load({'))
suite.check('entry carries the package id', entrySource.includes('id: "@local/dsh-terminal-mobile"'))
suite.check('entry has no chunk field', !entrySource.includes('chunk:'))
suite.check('chunk wraps a ModuleLoader registration', chunkSource.startsWith('window.__ModuleLoader__.load({'))
suite.check('chunk declares its filename', chunkSource.includes('chunk: "client.terminal-mobile.js"'))
suite.check('chunk name matches the host pattern', /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/.test('client.terminal-mobile.js'))
suite.check('entry loads the chunk through a literal relative path', entrySource.includes('require.async("./client.terminal-mobile.js")'))
suite.check('xterm css is inlined in the chunk', chunkSource.includes('.xterm-viewport') && chunkSource.includes('.xterm-helper-textarea'))
suite.check('entry stays small (chunk carries xterm)', entrySource.length < chunkSource.length / 10)

// ── one state store, not two ─────────────────────────────────────────────────
// The entry and the chunk are separate bundles with separate module graphs. If
// the chunk bundles its own copy of the preference module, the toolbar writes
// into a store the screen never subscribes to: A+ updates localStorage and the
// label, but xterm keeps the old font size forever. The storage key is the
// marker of that module, so it must appear in the entry exactly once and in the
// chunk not at all.
suite.check('the storage key lives in the entry bundle', entrySource.includes('dsh.terminal-mobile.v1'))
suite.check('the chunk does NOT bundle a second state module', !chunkSource.includes('dsh.terminal-mobile.v1'))
suite.check('the entry passes its state module through the inject face', entrySource.includes('ui: ui_state_exports'))
suite.check('the chunk reads the state module from props only', chunkSource.includes('ui: ui2') || chunkSource.includes('const uiState = ui2'))
suite.check('react is an external, not bundled', entrySource.includes('require("react")') && !entrySource.includes('react.production.min'))

// ── entry executes and registers ──────────────────────────────────────────────
const page = createPage()
const seed = {
  react: reactStub(),
  'react/jsx-runtime': jsxRuntimeStub(),
  'react-dom': {},
  'react-dom/client': {},
  '@deepseek-ai/cordis': {},
  '@deepseek-ai/dsh-client-store': {},
  '@deepseek-ai/dsh-client-ui-slots': {},
  '@deepseek-ai/dsh-client-ui-primitives': primitivesStub(),
  '@deepseek-ai/dsh-client-ui-dockkit': {},
}

const chunkPage = createPage()
const chunk = execute(chunkPage, 'client.terminal-mobile.js', { seed }).exports
suite.check('chunk exports TerminalBody', typeof chunk.TerminalBody === 'function')

const { registration, exports: entry } = execute(page, 'client.js', {
  seed,
  chunks: { 'client.terminal-mobile.js': chunk },
})

suite.check('registration id is the package name', registration.id === '@local/dsh-terminal-mobile')
suite.check('registration has no chunk', registration.chunk === undefined)
suite.check('entry exports apply', typeof entry.apply === 'function')
suite.check('entry exports inject', Array.isArray(entry.inject))
for (const service of ['slots', 'locale', 'sidebarRight', 'webTerminals', 'theme']) {
  suite.check(`inject declares ${service}`, entry.inject.includes(service))
}

// ── apply() against a fake cordis context ─────────────────────────────────────
const effects = []
const localeRegistrations = []
const slotRegistrations = []
const injections = []

// The real ClientTerminals.view() is stable per (sessionId, key); mirroring
// that here is what lets the test prove the screen reuses the same PTY model.
const fakeViews = new Map()
const fakeView = (sessionId, key) => {
  const id = `${sessionId}/${key}`
  let view = fakeViews.get(id)
  if (view === undefined) {
    view = { sessionId, key, state: { getSnapshot: () => ({ phase: 'connected' }), subscribe: () => () => {} } }
    fakeViews.set(id, view)
  }
  return view
}
const ctx = {
  effect(factory, label) {
    effects.push(label)
    const dispose = factory()
    return () => dispose?.()
  },
  locale: {
    register(namespace, dicts) {
      localeRegistrations.push({ namespace, dicts })
      return () => {}
    },
  },
  theme: {
    getTheme: () => ({ revision: 1 }),
  },
  on() {
    return () => {}
  },
  sidebarRight: {
    tabDomain: {
      occurrence: (sessionId, tab) => ({
        navigation: { getSnapshot: () => ({ address: `content:${tab.id}`, params: { shellPath: '/bin/bash' }, revision: 1 }) },
      }),
    },
  },
  webTerminals: {
    view: (sessionId, key, address, terminalId, shellPath) => ({ ...fakeView(sessionId, key), address, terminalId, shellPath }),
  },
  slots: {
    inject(key, callback) {
      injections.push(key)
      callback()
      return () => {}
    },
    register(options, component) {
      slotRegistrations.push({ options, component })
      return () => {}
    },
  },
}

entry.apply(ctx)

suite.check('apply registers exactly one slot entry', slotRegistrations.length === 1)
const body = slotRegistrations[0]
suite.check('slot is the pane body', body.options.name === 'sidebar.right.pane.tab')
suite.check('slot key is the official cell', body.options.key === '@deepseek-ai/dsh-client-ui-sidebar-terminal')
suite.check('slot priority is below the official default', body.options.priority < 0)
suite.check('slot priority is strictly negative', body.options.priority === -100)
suite.check('slot declares the locale namespace', body.options.locale === 'terminalMobile')
suite.check('slot injects into the pane declaration', injections.includes('sidebar.right.pane.tab'))
suite.check('component is a lazy wrapper', typeof body.component === 'function')

// The injected face must be complete: a missing member renders with undefined.
const face = body.options.inject('session-1')
suite.check('inject face carries view', typeof face.view === 'function')
suite.check('inject face carries keyedHooks.terminal', typeof face.keyedHooks?.terminal === 'function')
suite.check('inject face carries hooks.theme', typeof face.hooks?.theme?.getSnapshot === 'function' && typeof face.hooks?.theme?.subscribe === 'function')
suite.check('inject face carries the preference store', typeof face.ui?.preferences?.getSnapshot === 'function')
const view = face.view('tab-1')
suite.check('view resolves through webTerminals', view.address === 'content:tab-1' && view.shellPath === '/bin/bash')
// The keyed hook is the model's own observable, not a wrapper: the screen
// subscribes to exactly the state `view()` hands it.
suite.check('keyed terminal hook resolves the same model state', face.keyedHooks.terminal('tab-1') === view.state)

// ── locale dictionaries ───────────────────────────────────────────────────────
const locale = localeRegistrations[0]
suite.check('locale namespace is terminalMobile', locale.namespace === 'terminalMobile')
const zhKeys = Object.keys(locale.dicts.zh).sort()
const enKeys = Object.keys(locale.dicts.en).sort()
suite.equal('zh/en key sets are identical', zhKeys, enKeys)
suite.check('every key has non-empty copy', zhKeys.every((key) => locale.dicts.zh[key] !== '' && locale.dicts.en[key] !== ''))
for (const key of ['fontDecrease', 'fontIncrease', 'scrollTerminal', 'scrollPage', 'keyboardOff', 'keyboardOn', 'showBar', 'hideBar', 'editor.title', 'editor.customAdd', 'bar.edit']) {
  suite.check(`copy carries ${key}`, locale.dicts.zh[key] !== undefined && locale.dicts.en[key] !== undefined)
}
for (const key of ['ctrl', 'alt', 'tab', 'esc', 'backspace', 'up', 'home', 'pipe', 'tilde']) {
  suite.check(`copy carries key.${key}`, locale.dicts.zh[`key.${key}`] !== undefined)
}

suite.check('apply installed its effects', effects.length >= 2)

suite.finish()

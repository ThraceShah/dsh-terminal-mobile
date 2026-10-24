/**
 * Shared harness for the Node-side tests.
 *
 * The built bundles are CommonJS factories handed to the page's
 * `window.__ModuleLoader__`; this harness recreates just enough of that
 * environment to execute them, so the tests exercise the SHIPPED artifacts
 * rather than the sources.
 *
 * @module test/harness
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

/** Read one built artifact. */
export function artifact(name) {
  return readFileSync(join(ROOT, name), 'utf8')
}

/** Whether an artifact exists. */
export function hasArtifact(name) {
  try {
    readFileSync(join(ROOT, name))
    return true
  } catch {
    return false
  }
}

/**
 * Build a fake page environment.
 * @param {object} options
 * @param {Record<string, unknown>} [options.seed] - module-table seed (the page externals).
 * @param {Record<string, unknown>} [options.chunks] - chunk name → exports.
 * @param {string[]} [options.styles] - CSS markers present before loading.
 */
export function createPage(options = {}) {
  const registrations = []
  const styles = new Map((options.styles ?? []).map((marker) => [marker, 1]))
  const document = {
    querySelector(selector) {
      const match = /^style\[([a-z-]+)\]$/.exec(selector)
      if (match === null) return null
      for (const marker of styles.keys()) if (marker === match[1]) return { marker }
      return null
    },
    createElement() {
      const element = {
        attributes: {},
        textContent: '',
        setAttribute(name, value) {
          element.attributes[name] = value
        },
        getAttribute(name) {
          return element.attributes[name] ?? null
        },
      }
      return element
    },
    head: {
      appendChild(element) {
        const attribute = element.attributes?.['data-dsh-terminal-mobile-xterm-css'] !== undefined ? 'data-dsh-terminal-mobile-xterm-css' : element.attributes?.['data-dsh-terminal-mobile-css'] !== undefined ? 'data-dsh-terminal-mobile-css' : undefined
        if (attribute !== undefined) styles.set(attribute, element.textContent.length)
      },
    },
  }
  const window = { document }
  const context = {
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    URL,
    Symbol,
    Object,
    Array,
    Map,
    Set,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Error,
    RegExp,
    Date,
    Promise,
    parseInt,
    parseFloat,
    isFinite,
    isNaN,
    queueMicrotask,
    structuredClone,
    navigator: { userAgent: 'node-test', platform: 'Linux x86_64', language: 'en-US' },
    performance,
    requestAnimationFrame: (callback) => setTimeout(() => callback(0), 0),
    cancelAnimationFrame: (handle) => clearTimeout(handle),
    getComputedStyle: () => ({ backgroundColor: '#000000', color: '#ffffff' }),
  }
  window.__ModuleLoader__ = {
    load(registration) {
      registrations.push(registration)
    },
  }
  vm.createContext(context)
  return { context, registrations, styles, window, document }
}

/**
 * Execute a built artifact inside a fake page and return its module exports.
 * @param {ReturnType<typeof createPage>} page
 * @param {string} name - artifact filename.
 * @param {object} options
 * @param {Record<string, unknown>} options.seed - module-table seed.
 * @param {Record<string, unknown>} [options.chunks] - chunk name → exports.
 * @param {() => void} [options.onFactory] - called before the factory runs.
 */
export function execute(page, name, options) {
  const source = artifact(name)
  vm.runInContext(source, page.context, { filename: name })
  const registration = page.registrations[page.registrations.length - 1]
  const requireFn = (specifier) => {
    if (options.seed[specifier] !== undefined) return options.seed[specifier]
    throw new Error(`require(${JSON.stringify(specifier)}) missed the module table`)
  }
  requireFn.async = async (specifier) => {
    const relative = specifier.replace(/^\.\//, '')
    const chunk = options.chunks?.[relative]
    if (chunk === undefined) throw new Error(`require.async(${JSON.stringify(specifier)}) missed the chunk table`)
    return chunk
  }
  const exports = registration.factory(requireFn)
  return { registration, exports }
}

/** A minimal React stand-in: enough for module-level `React.lazy` / `createElement`. */
export function reactStub() {
  const lazy = (factory) => {
    const component = function LazyComponent() {
      return null
    }
    component.__lazyFactory = factory
    return component
  }
  const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children })
  return {
    lazy,
    createElement,
    createContext: () => ({ Provider: null, Consumer: null }),
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useRef: () => ({ current: undefined }),
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    Fragment: 'Fragment',
    Suspense: 'Suspense',
  }
}

/** A React stand-in that also records the jsx-runtime calls. */
export function jsxRuntimeStub() {
  const jsx = (type, props) => ({ type, props })
  return { jsx, jsxs: jsx, Fragment: 'Fragment' }
}

/** Minimal primitives stub: every export is a named function component. */
export function primitivesStub(names = []) {
  const stub = {}
  for (const name of ['Button', 'Input', 'Modal', 'Switch', 'Checkbox', 'Menu', ...names]) {
    stub[name] = function PrimitiveStub(props) {
      return { type: name, props }
    }
  }
  stub.IconPlusOutlineRegular = function Icon() {
    return null
  }
  return stub
}

/** A tiny assertion helper with a pass counter. */
export function createSuite(label) {
  const state = { passed: 0, failed: 0, label }
  const check = (name, condition, detail) => {
    if (condition) {
      state.passed += 1
      return true
    }
    state.failed += 1
    console.error(`  ✗ ${label} / ${name}${detail === undefined ? '' : ` — ${detail}`}`)
    return false
  }
  /**
   * Assert two JSON-comparable values match.
   *
   * `detail` is shown only on failure: the expected and actual values are
   * already reported, so it carries what the caller knows that they do not —
   * which step of a sequence produced them.
   */
  const equal = (name, actual, expected, detail) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    return check(name, ok, ok ? undefined : `${detail === undefined ? '' : `${detail}: `}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
  const finish = () => {
    const total = state.passed + state.failed
    if (state.failed > 0) {
      console.error(`${label}: ${state.failed}/${total} failed`)
      process.exitCode = 1
    } else {
      console.log(`${label}: ${state.passed}/${total} passed`)
    }
    return state.failed === 0
  }
  return { check, equal, finish, state }
}

export { require as nodeRequire }

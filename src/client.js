/**
 * Browser entry of `@local/dsh-terminal-mobile`.
 *
 * Two responsibilities:
 * 1. Shadow the official terminal screen for the SAME keyed cell the official
 *    package occupies (`sidebar.right.pane.tab` + key = its package id) at a
 *    strictly lower priority. A keyed slot renders the LOWEST priority entry of
 *    a cell, so `-100` wins over the official default `0`, while the tab type,
 *    the PTY, the guide entry and the title stay exactly as the official
 *    package registered them.
 * 2. Provide the full injected face the screen needs. Inject faces are NOT
 *    merged across entries of one cell — the winning entry must bring `view`,
 *    `keyedHooks.terminal`, `hooks.theme` and the `ui` preference store itself,
 *    or the screen renders with `undefined` props.
 *
 * @module client
 */
import * as React from 'react'

import { LOCALE_NAMESPACE, en, zh } from './locales.js'
import * as uiState from './ui-state.js'

/** Services this plugin needs from the client root context. */
export const inject = ['slots', 'locale', 'sidebarRight', 'webTerminals', 'theme']

/** The cell key of the official terminal screen. */
const OFFICIAL_TERMINAL_ID = '@deepseek-ai/dsh-client-ui-sidebar-terminal'

/**
 * Shadowing rank. The official body registers at the default `0`; a strictly
 * lower number wins the cell, and an EQUAL number would throw at registration
 * time ("cell already occupied at this priority").
 */
const SHADOW_PRIORITY = -100

const LoadedBody = React.lazy(async () => ({ default: (await require.async('./client.terminal-mobile.js')).TerminalBody }))

/**
 * Suspend while the package-local chunk arrives.
 * @param {object} props - sidebar body props.
 * @returns {React.ReactNode}
 */
function LazyTerminalBody(props) {
  return React.createElement(React.Suspense, { fallback: null }, React.createElement(LoadedBody, props))
}

/**
 * Client plugin body.
 * @param {import('@deepseek-ai/cordis').Context} ctx - client root context.
 */
export function apply(ctx) {
  const namespace = LOCALE_NAMESPACE
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'terminal-mobile.copy')

  const theme = {
    getSnapshot: () => ctx.theme.getTheme(),
    subscribe: (listener) => ctx.on('theme/change', listener),
  }

  // Reuse the official terminal model: same (sessionId, occurrence key) returns
  // the same PTY, so a remount of this screen never allocates a new shell.
  const target = (sessionId, key) => ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: key }).navigation.getSnapshot()
  const view = (sessionId, key) => {
    const navigation = target(sessionId, key)
    const params = navigation.params
    const terminalId = params !== undefined && 'terminalId' in params ? params.terminalId : undefined
    const shellPath = params !== undefined && 'shellPath' in params ? params.shellPath : undefined
    return ctx.webTerminals.view(sessionId, key, navigation.address, terminalId, shellPath)
  }

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: OFFICIAL_TERMINAL_ID,
            priority: SHADOW_PRIORITY,
            locale: namespace,
            inject: (sessionId) => ({
              view: (key) => view(sessionId, key),
              keyedHooks: { terminal: (key) => view(sessionId, key).state },
              hooks: { theme },
              // The preference state lives in THIS bundle, and the screen lives in
              // the lazily loaded chunk — two separate bundles with two separate
              // module graphs. Passing the module namespace across the inject face
              // is what keeps one store: importing './ui-state.js' from the chunk
              // would create a second, disconnected copy.
              ui: uiState,
            }),
          },
          LazyTerminalBody,
        ),
      ),
    'terminal-mobile.body',
  )
}

/**
 * The mobile terminal screen: toolbar, xterm lifecycle, extension key bar.
 *
 * Ownership boundary: the official terminal provider owns the PTY, the session
 * binding, reconnect and cleanup. This component owns only what is drawn — it
 * drives `model` (mount/connect/write/resize/acknowledge) and never creates a
 * terminal of its own.
 *
 * @module TerminalBody
 */
import * as React from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

import { Button, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

import { FONT_SIZE_MAX, FONT_SIZE_MIN } from './settings.js'
import { installStyles } from './styles.js'
import { installXtermStyles } from './xterm-styles.js'
import { TerminalTheme, observeTerminalCursor, paletteOf } from './terminal-engine.js'
import { applySoftKeyboardGate, focusScreen } from './gate.js'
import { installScrollOwnership } from './scroll.js'
import { installLongPressCopy } from './selection.js'
import { installKeyboardInset } from './viewport.js'
import { createFrameCapture } from './debug.js'
import { KeyBar } from './KeyBar.js'
import { KeyEditor } from './KeyEditor.js'

const FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Read the stylesheet inlined by the build; empty when the define is absent. */
function xtermCss() {
  return typeof __DSH_TM_XTERM_CSS__ === 'string' ? __DSH_TM_XTERM_CSS__ : ''
}

/**
 * Render the terminal screen.
 * @param {object} props - sidebar occurrence share, injected terminal model, copy.
 * @returns {React.ReactNode}
 */
export function TerminalBody({ useTabInfo, useTerminal, useTheme, view, t, ui }) {
  const { tab } = useTabInfo()
  const model = view(tab.id)
  const state = useTerminal(tab.id)
  const theme = useTheme((value) => value)
  // The state module arrives ONLY through the injected `ui` face (see
  // client.js): it is created in the entry bundle, and the chunk is a separate
  // module graph. Importing './ui-state.js' here would bundle a second copy
  // whose store nobody subscribes to — the toolbar would write into a store the
  // screen never reads.
  const uiState = ui
  const prefs = React.useSyncExternalStore(uiState.preferences.subscribe, uiState.preferences.getSnapshot, uiState.preferences.getSnapshot)

  // Soft-keyboard state is deliberately NOT persisted: a tab reopened on a
  // phone must not summon the keyboard without a tap.
  const [softKeyboard, setSoftKeyboard] = React.useState(false)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const emulatorRef = React.useRef(undefined)

  React.useEffect(() => installStyles(), [])
  React.useEffect(() => {
    return model.mount()
  }, [model])

  if (state === undefined) return null

  const newTerminal = React.createElement(
    Button,
    {
      variant: 'primary',
      size: state.issue === 'missingTerminal' ? 'md' : 'sm',
      icon: React.createElement(IconPlusOutlineRegular, {}),
      onClick: () => tab.actions.openTab('terminal', { replaceTab: true }),
    },
    t('new'),
  )

  if (state.issue === 'missingTerminal') {
    return React.createElement(
      'section',
      { className: 'dsh-tm-root', 'data-sidebar-terminal': true },
      React.createElement(
        'div',
        { className: 'dsh-tm-status', role: 'alert' },
        React.createElement('span', null, t('missingTerminal')),
        newTerminal,
      ),
    )
  }

  const error = state.phase === 'disconnected' ? undefined : state.issue === undefined ? (state.error ?? state.info?.error) : t(state.issue)
  let status
  if (state.phase === 'idle' || state.phase === 'loading') status = t('loading')
  else if (state.phase === 'creating' || state.phase === 'connecting' || state.phase === 'disconnected') status = t(state.phase)
  else if (state.info?.state === 'exited') status = t('exited', { code: String(state.info.exitCode ?? '—') })
  else if (state.info?.state === 'failed') status = t('unavailable')
  else if (state.phase === 'closed') status = t('closed')

  const ended = state.info?.state === 'exited' || state.phase === 'closed'
  const retry = !ended && (state.phase === 'failed' || state.phase === 'disconnected')
  const readOnly = state.phase === 'connected' && state.info?.state === 'running' && !state.writable

  const write = (data) => {
    if (data !== '') model.write(data)
  }

  const sendKey = (payload) => {
    write(uiState.consumeSticky(payload))
    // Focus belongs to the key-bar gesture only. The data path itself never
    // focuses, or a key press would steal focus from the key editor.
    focusScreen(emulatorRef.current)
  }

  return React.createElement(
    'section',
    {
      className: 'dsh-tm-root',
      'data-sidebar-terminal': true,
      'data-scroll-mode': prefs.scrollMode,
      'data-keybar': prefs.keyBar.enabled ? 'on' : 'off',
    },
    React.createElement(Toolbar, {
      ui: uiState,
      prefs,
      t,
      softKeyboard,
      // The unlock MUST happen inside this gesture's synchronous stack: a
      // mobile browser only opens the soft keyboard from the call stack of the
      // user's own tap. Doing it in an effect (one render later) silently fails
      // on iOS and Android alike.
      onToggleSoftKeyboard: () => {
        const next = !softKeyboard
        setSoftKeyboard(next)
        const emulator = emulatorRef.current
        if (emulator === undefined) return
        applySoftKeyboardGate(emulator, !next, !state.writable)
        if (next) focusScreen(emulator)
      },
      onToggleKeyBar: () => uiState.setKeyBarEnabled(!prefs.keyBar.enabled),
      status,
      readOnly,
      retry,
      ended,
      onTakeControl: () => model.connect(),
      onReconnect: () => (state.info === undefined ? model.refresh() : model.connect()),
      newTerminal,
    }),
    React.createElement(TerminalScreen, {
      model,
      state,
      uiState,
      visible: tab.visible,
      theme,
      prefs,
      softKeyboard,
      label: t('title'),
      emulatorRef,
      // A getter, not frozen strings: the chip must follow a locale change
      // without reinstalling the gesture handlers.
      labels: () => ({
        copy: t('select.copy'),
        copied: t('select.copied'),
        copyFailed: t('select.copyFailed'),
      }),
      onTap: () => focusScreen(emulatorRef.current),
    }),
    error === undefined
      ? null
      : React.createElement('p', { className: 'dsh-tm-error', role: 'alert' }, t('failed', { message: error })),
    prefs.keyBar.enabled
      ? React.createElement(KeyBar, {
          t,
          prefs,
          ui: uiState,
          onKey: sendKey,
          onEdit: () => setEditorOpen(true),
        })
      : null,
    editorOpen
      ? React.createElement(KeyEditor, {
          t,
          ui: uiState,
          onClose: () => {
            setEditorOpen(false)
            // Leaving the editor is the end of that interaction: an armed
            // modifier with no visible key bar would be an invisible trap.
            uiState.clearSticky()
          },
        })
      : null,
  )
}

function Toolbar({ ui, prefs, t, softKeyboard, onToggleSoftKeyboard, onToggleKeyBar, status, readOnly, retry, ended, onTakeControl, onReconnect, newTerminal }) {
  const pageMode = prefs.scrollMode === 'page'
  return React.createElement(
    'div',
    { className: 'dsh-tm-toolbar', role: 'toolbar', 'data-terminal-mobile-toolbar': true },
    React.createElement(
      'div',
      { className: 'dsh-tm-group' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-tm-iconbutton',
          'aria-label': t('fontDecrease'),
          title: t('fontDecrease'),
          disabled: prefs.fontSize <= FONT_SIZE_MIN,
          'data-terminal-mobile-action': 'font-decrease',
          onClick: () => ui.setFontSize(prefs.fontSize - 1),
        },
        'A−',
      ),
      React.createElement(
        'span',
        { className: 'dsh-tm-fontvalue', 'data-terminal-mobile-font-size': prefs.fontSize, 'aria-live': 'polite' },
        `${prefs.fontSize}px`,
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-tm-iconbutton',
          'aria-label': t('fontIncrease'),
          title: t('fontIncrease'),
          disabled: prefs.fontSize >= FONT_SIZE_MAX,
          'data-terminal-mobile-action': 'font-increase',
          onClick: () => ui.setFontSize(prefs.fontSize + 1),
        },
        'A+',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh-tm-group' },
      readOnly ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: onTakeControl }, t('control')) : null,
      retry ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: onReconnect }, t('reconnect')) : null,
      ended ? newTerminal : null,
    ),
    React.createElement('div', { className: 'dsh-tm-spacer' }),
    React.createElement(
      'div',
      { className: 'dsh-tm-group' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-tm-iconbutton',
          'aria-label': pageMode ? t('scrollToTerminal') : t('scrollToPage'),
          title: pageMode ? t('scrollToTerminal') : t('scrollToPage'),
          'aria-pressed': pageMode,
          'data-terminal-mobile-action': 'scroll-mode',
          'data-scroll-mode': prefs.scrollMode,
          onClick: () => ui.setScrollMode(pageMode ? 'terminal' : 'page'),
        },
        pageMode ? '⇕' : '⇳',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-tm-iconbutton',
          'aria-label': softKeyboard ? t('keyboardOff') : t('keyboardOn'),
          title: softKeyboard ? t('keyboardOff') : t('keyboardOn'),
          'aria-pressed': softKeyboard,
          'data-terminal-mobile-action': 'soft-keyboard',
          onClick: onToggleSoftKeyboard,
        },
        '⌨',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-tm-iconbutton',
          'aria-label': prefs.keyBar.enabled ? t('hideBar') : t('showBar'),
          title: prefs.keyBar.enabled ? t('hideBar') : t('showBar'),
          'aria-pressed': prefs.keyBar.enabled,
          'data-terminal-mobile-action': 'keybar-toggle',
          onClick: onToggleKeyBar,
        },
        '⌗',
      ),
    ),
    status === undefined ? null : React.createElement('span', { className: 'dsh-tm-status', role: 'status' }, status),
  )
}

function TerminalScreen({ model, state, visible, theme, prefs, softKeyboard, label, labels, emulatorRef, uiState, onTap }) {
  const hostRef = React.useRef(null)
  const fitRef = React.useRef(undefined)
  const paletteRef = React.useRef(undefined)
  const lastRevision = React.useRef(0)
  const captureRef = React.useRef(undefined)
  const latest = React.useRef({ state, visible, prefs, uiState })
  latest.current = { state, visible, prefs, uiState }

  React.useLayoutEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined
    // Install the stylesheet before open(): xterm measures its own DOM during
    // open, and a missing stylesheet poisons those measurements for the whole
    // session (clicks land on the wrong row, the viewport reports no height).
    installXtermStyles(xtermCss())

    const emulator = new Terminal({
      minimumContrastRatio: 4.5,
      cursorBlink: true,
      fontSize: latest.current.prefs.fontSize,
      fontFamily: FONT_FAMILY,
      scrollback: latest.current.state.environment?.scrollback ?? 0,
    })
    const fit = new FitAddon()
    emulator.loadAddon(fit)
    emulator.open(host)
    const palette = new TerminalTheme(emulator)
    const cursor = observeTerminalCursor(emulator, host, () => palette.cursor)
    emulator.textarea?.setAttribute('aria-label', label)
    emulatorRef.current = emulator
    fitRef.current = fit
    paletteRef.current = palette
    lastRevision.current = 0
    captureRef.current = createFrameCapture()

    const input = emulator.onData((data) => {
      // Data path: write bytes only. Calling focus() here is what breaks the
      // key editor — xterm emits onData while its helper textarea is blurring,
      // so a focus() call would yank focus back out of the editor's input and
      // the user sees "my settings vanished".
      model.write(latest.current.uiState.consumeSticky(data))
    })

    const measure = () => fitScreen(emulator, fit, latest.current.state, model)
    const observer = new ResizeObserver(() => measure())
    observer.observe(host)
    // The inset is a CONSUMER-side variable: the root's padding-bottom uses it,
    // and CSS variables only inherit downward. Writing it on the screen host
    // (a descendant of the root) would leave the root's padding at zero — the
    // key bar would still sit behind the keyboard.
    const insetTarget = host.closest('[data-sidebar-terminal]') ?? host
    const keyboard = installKeyboardInset(insetTarget, () => measure())
    // The long-press selection shares this gesture with scrolling: it claims
    // the touch (raising `selecting`) only after a hold that did not move past
    // the slop, and the scroll module stands down while that flag is up.
    const gesture = { selecting: false }
    const scrolling = installScrollOwnership({
      node: host,
      mode: () => latest.current.prefs.scrollMode,
      target: () => emulator,
      lineHeight: () => measuredRowHeight(emulator),
      canScroll: () => emulator.buffer.active.length > emulator.rows,
      paused: () => gesture.selecting,
    })
    const selecting = installLongPressCopy({
      node: host,
      emulator,
      gesture,
      labels,
    })

    return () => {
      selecting.dispose()
      scrolling.dispose()
      keyboard.dispose()
      observer.disconnect()
      input.dispose()
      cursor.dispose()
      palette.dispose()
      emulator.dispose()
      emulatorRef.current = undefined
      fitRef.current = undefined
      paletteRef.current = undefined
    }
  }, [model])

  // Theme: recompute from the container's resolved colours on every change.
  React.useLayoutEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const { background, foreground } = paletteOf(host)
    paletteRef.current?.update(background, foreground)
    refit(emulatorRef.current, fitRef.current, latest.current.state, model)
  }, [theme, model])

  // Font size: change the option and refit. Rebuilding the emulator here would
  // discard the scrollback the user is reading.
  React.useLayoutEffect(() => {
    const emulator = emulatorRef.current
    if (emulator === undefined) return
    if (emulator.options.fontSize !== prefs.fontSize) emulator.options.fontSize = prefs.fontSize
    refit(emulator, fitRef.current, latest.current.state, model)
  }, [prefs.fontSize, model])

  // Screen writes: one frame at a time, acknowledged after xterm parsed it.
  React.useLayoutEffect(() => {
    const emulator = emulatorRef.current
    const render = state.render
    if (emulator === undefined || render === undefined || render.revision <= lastRevision.current) return
    lastRevision.current = render.revision
    captureRef.current?.push({ revision: render.revision, type: render.frame.type })
    if (render.frame.type === 'snapshot') {
      emulator.reset()
      emulator.resize(render.frame.info.cols, render.frame.info.rows)
    }
    emulator.write(render.frame.type === 'snapshot' ? render.frame.screen : render.frame.data, () => {
      model.acknowledge(render.revision)
    })
  }, [state.render, model])

  // Scrollback: the emulator is created before the Host environment arrives (the
  // screen mounts as soon as a model exists, which is earlier than the official
  // body's `info !== undefined` gate). Creating xterm with `scrollback: 0` and
  // never correcting it silently discards all history — the user cannot scroll
  // back at all, and a swipe has nowhere to go.
  React.useLayoutEffect(() => {
    const emulator = emulatorRef.current
    const scrollback = state.environment?.scrollback
    if (emulator === undefined || scrollback === undefined) return
    if (emulator.options.scrollback !== scrollback) emulator.options.scrollback = scrollback
  }, [state.environment?.scrollback])

  // Writable / visibility / soft-keyboard transitions all land here.
  React.useLayoutEffect(() => {
    const emulator = emulatorRef.current
    const host = hostRef.current
    if (emulator === undefined) return
    const locked = !state.writable
    emulator.options.disableStdin = locked
    // xterm rewrites textarea.readOnly whenever disableStdin changes, so the
    // gate is re-applied after every such change rather than once at mount.
    applySoftKeyboardGate(emulator, !softKeyboard, locked)
    if (host !== null && visible && state.writable) refit(emulator, fitRef.current, state, model)
    else if (state.info !== undefined && !state.writable) emulator.resize(state.info.cols, state.info.rows)
  }, [visible, state.writable, state.info?.cols, state.info?.rows, softKeyboard, model])

  React.useEffect(() => {
    emulatorRef.current?.textarea?.setAttribute('aria-label', label)
  }, [label, emulatorRef])

  return React.createElement('div', {
    className: 'dsh-tm-screen',
    'data-sidebar-terminal-screen': true,
    ref: hostRef,
    onPointerDown: onTap,
  })
}

/** Measured row height in CSS pixels, or 0 before the first layout. */
function measuredRowHeight(emulator) {
  const rows = emulator.element?.querySelector('.xterm-rows')
  if (rows === undefined || rows === null || emulator.rows <= 0) return 0
  return rows.getBoundingClientRect().height / emulator.rows
}

function refit(emulator, fit, state, model) {
  if (emulator === undefined || fit === undefined) return
  fitScreen(emulator, fit, state, model)
}

function fitScreen(emulator, fit, state, model) {
  const dimensions = fit.proposeDimensions()
  const environment = state.environment
  if (dimensions === undefined || environment === undefined) return
  const cols = Math.min(dimensions.cols, environment.maxCols)
  const rows = Math.min(dimensions.rows, environment.maxRows)
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 2 || rows < 1) return
  if (emulator.cols !== cols || emulator.rows !== rows) emulator.resize(cols, rows)
  model.resize(cols, rows)
}

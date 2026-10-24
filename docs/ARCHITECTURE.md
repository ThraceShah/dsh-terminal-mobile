# Architecture and pitfalls

Why this plugin is shaped the way it is, and the traps that cost real debugging
time while building it. Read this before changing the slot registration, the
bundle layout, or the scroll/keyboard code.

## 1. Ownership: replace the screen, not the terminal

The official `@deepseek-ai/dsh-client-ui-sidebar-terminal` owns the tab type, the
PTY allocation, the session binding, reconnect, cleanup and the guide card. It
renders its screen by registering into the keyed slot:

| item | value |
| --- | --- |
| slot | `sidebar.right.pane.tab` |
| key | `@deepseek-ai/dsh-client-ui-sidebar-terminal` (its package id) |
| priority | default `0` |

A keyed slot renders the **lowest** priority entry of a cell, and a second
registration at the *same* priority throws at registration time. This plugin
therefore registers the same key at `priority: -100`.

Do **not**:

- register a new tab kind (`sidebarRightTabs.register({ kind: 'terminal', … })`)
  — that shadows the whole type and loses the guide, recovery and cleanup;
- overlay a component on top of the official screen — two emulators fight over
  the same model and the resize path;
- register the same key at the same priority — install fails loudly.

## 2. The injected face is not merged

`inject` returns the business face of *one* registration. Two entries of the
same cell do not combine their faces, so the winning entry must bring everything
the screen needs:

```js
inject: (sessionId) => ({
  view: (key) => view(sessionId, key),           // the terminal model
  keyedHooks: { terminal: (key) => view(sessionId, key).state },
  hooks: { theme },                              // bound as useTheme
  ui: uiState,                                   // the preference module
})
```

Missing any member renders the screen with `undefined` props — usually a
`Cannot read properties of undefined` from the first hook call.

`view()` must resolve through the sidebar occurrence, exactly like the official
implementation:

```js
const navigation = ctx.sidebarRight.tabDomain
  .occurrence(sessionId, { id: key })
  .navigation.getSnapshot()
ctx.webTerminals.view(sessionId, key, navigation.address, params?.terminalId, params?.shellPath)
```

`ClientTerminals.view` caches per `(sessionId, key)`, so a remount reuses the
same PTY. Never construct a terminal model yourself.

## 3. Two bundles, one state store

The browser artifact is split in two because xterm is large and most sessions
never open a terminal:

- `client.js` — entry: locale, slot registration, `React.lazy` +
  `require.async('./client.terminal-mobile.js')`;
- `client.terminal-mobile.js` — chunk: xterm, FitAddon, screen, key bar, editor.

The Host serves a chunk only from the entry's directory, only for names matching
`^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$`.

**The trap:** these are two independent module graphs. If both import
`./ui-state.js`, each gets its own copy with its own store. The toolbar then
writes into a store the screen never subscribes to — `A+` updates the label and
`localStorage` while xterm keeps the old font size, and the sticky Ctrl button
never shows as armed.

The state module is created once, in the entry bundle, and handed to the chunk
through the inject face. `test/load.mjs` asserts the storage key appears exactly
once, in the entry.

## 4. Bundle contract

Each artifact is a script that calls:

```js
window.__ModuleLoader__.load({ id, chunk?, factory: (require) => module.exports })
```

- `format: 'cjs'`, `platform: 'browser'`, `jsx: 'automatic'`;
- `require.async('./client.terminal-mobile.js')` must stay a **literal** relative
  path;
- **externals** (page seed — bundling them breaks hooks by creating a second
  React): `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`,
  `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
  `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
  `@deepseek-ai/dsh-client-ui-dockkit`;
- `@xterm/xterm` and `@xterm/addon-fit` are **not** seeded and are bundled into
  the chunk.

The plugin's `package.json` must not list xterm or react as runtime
dependencies: they are either bundled or supplied by the page.

## 5. xterm's stylesheet must be inlined

`@xterm/xterm/css/xterm.css` is not optional decoration. Without it:

- every pointer coordinate maps to the wrong cell (taps land a row off);
- the top row looks duplicated or garbled;
- `.xterm-viewport` reports `scrollHeight === 0`.

The official package gets this stylesheet from the Host's global CSS pipeline. A
self-bundled plugin has no such pipeline, so `build.mjs` reads the file and
`define`s it into the chunk; `installXtermStyles()` injects it once, **before**
`Terminal.open()` (xterm measures its own DOM during `open`).

`test/geometry.mjs` is the guard: it asserts one stylesheet tag, a real viewport
height, a non-zero scroll height, and that the row grid origin and pitch line up
with the screen.

## 6. Focus discipline

**Never call `focus()` from a data-write path.**

xterm emits `onData` while its helper textarea is losing focus. If that handler
calls `terminal.focus()`, the caret is pulled back out of whatever input the user
is typing in. In the key editor this looks like "my configuration disappeared" —
characters go to the shell instead of the label field.

- `onData` → write bytes only;
- key-bar press → write bytes, then `focus()` (the press is an explicit gesture);
- key-bar buttons use `pointerdown` + `preventDefault()`, not `click`, so the
  press never moves focus at all.

## 7. Soft-keyboard gating

Default: the user did not ask for a keyboard. The helper textarea gets
`readOnly = true` and `inputmode = 'none'`, so a tap neither summons a keyboard
nor swallows the tap.

Two things make this harder than it looks:

1. **xterm rewrites `textarea.readOnly` whenever `disableStdin` changes.** The
   gate must be re-applied after every writable / disableStdin transition, not
   once at mount.
2. **Unlocking must happen inside the tap's own synchronous call stack.** A
   mobile browser only opens the keyboard from a user gesture; doing the unlock
   in a `useEffect` (one render later) silently fails. The toolbar toggle
   therefore flips state *and* calls `applySoftKeyboardGate()` + `focus()` in the
   same handler.

Hardware keys still work while gated: xterm's keydown path is independent of
`readOnly`. `test/roundtrip.mjs` asserts both halves.

The switch is deliberately not persisted.

## 8. Scroll ownership

`.xterm-viewport` (the scroller) and `.xterm-screen` (the drawing surface) are
siblings. A finger swiping over the text has no scrollable ancestor beneath it,
so the browser scrolls the page instead of the terminal.

- `scrollMode: 'terminal'` (default): `touch-action: none`; non-passive
  `touchstart`/`touchmove`/`touchend` and capture-phase `wheel`; pixel deltas are
  converted to `scrollLines` with a banked remainder and a short inertia tail.
- `scrollMode: 'page'`: `touch-action: pan-y`; handlers still
  `stopPropagation()` in the capture phase but deliberately **do not**
  `preventDefault()`. xterm's own wheel listener calls `preventDefault`, so
  "doing nothing" freezes the page.

Two testing notes that matter:

- `page.mouse.wheel` in a touch context may not produce a DOM `wheel` event at
  all — use synthetic events and judge consumption by `defaultPrevented`.
- **xterm 6 renders scrollback by replacing row content, not by scrolling a DOM
  element**: `.xterm-viewport` and `.xterm-scrollable-element` both keep
  `scrollTop === 0` forever. Assert on the top visible row, not on a scroll
  offset. (Why it can replace rows at all: see section 14.)

## 9. Scrollback is an option that arrives late

The screen mounts as soon as a model exists, which is *before* the Host
environment arrives. Creating the emulator with `scrollback: 0` (the value when
`state.environment` is still `undefined`) and never correcting it silently drops
all history: the user cannot scroll back, and a swipe has nowhere to go.

The screen therefore re-applies `options.scrollback` whenever
`state.environment?.scrollback` changes.

## 10. Keyboard inset

A soft keyboard shrinks the **visual** viewport while the **layout** viewport
keeps its height, so anything anchored to the bottom of the layout viewport ends
up behind the keyboard.

```
inset = max(0, innerHeight - (visualViewport.offsetTop + visualViewport.height))
```

Two rules:

- write the value on the element that **consumes** it — CSS variables inherit
  downward, so writing it on a descendant leaves the root's padding at zero;
- observe `visualViewport` `resize` **and** `scroll`, plus window `resize` and
  `orientationchange`, and refit the emulator on every change.

## 11. Key bar layout

The bar is a wrapping flex row with `overflow-x: hidden` and `max-height: 40vh`
(vertical scroll inside). It must never be a horizontal scroller: a key added by
the user would land off-screen behind a hidden scrollbar, which reads as "the key
I just added disappeared".

Half-filled custom rows (a label typed, the payload not yet) are real intent and
are persisted as-is; only a wholly blank row is dropped.

Backspace is labelled `Bksp` (ASCII) and sends `\x7f` (DEL), not `\b`. `⌫` is
missing from many terminal font stacks and renders as a box.

## 12. Sticky modifiers

Termux semantics:

- a multi-character payload that is not an ESC sequence is a paste/IME insert —
  send it verbatim, consume nothing;
- Ctrl maps a single character to its C0 byte; a multi-character ESC sequence
  keeps its bytes but still consumes the modifier (the press was answered);
- Alt prefixes `ESC` and is applied last, so Ctrl+Alt yields `ESC` + C0.

## 13. Testing on a real Host

- **Terminal quota.** The Host caps terminals per Session (~8, exited ones
  included). Every test that opens a tab consumes one, so a long verification
  round on one profile eventually fails with `terminalLimit` — which looks like a
  product bug. Use a **fresh `DSH_HOME` per round**; `test/browser.mjs` throws a
  named error when it detects the quota so the cause is never mistaken.
- **Auth cookie.** `/` and `/plugins/...` return 401 without one. The cookie name
  is authority-bound (`dsh-auth-` + sha256(authority)) and the value is HMAC'd
  with the profile's own secret, so it must be minted from the server's
  `Set-Cookie` via the printed `?token=` — never reconstructed.
- **Onboarding.** A fresh profile shows a sequence of dialogs (preview notice,
  then an API-key prompt). They sit above the page and silently eat taps; dismiss
  all of them before asserting anything.
- **Ports.** Run the test server on a port that is not the user's GUI, and stop it
  by PID (never by a `pkill` pattern that could match the user's own server).
- **Serving changes.** The bundle is read at startup and cached with a revision;
  restart the server after a rebuild.

## 14. Measuring the screen: xterm has two renderers

The first cut of the long-press gesture did the obvious thing —
`node.querySelector('canvas')`, then divide its box by `cols` to get a column —
and did nothing at all on a real phone. The gesture looked broken in a way no
assertion could explain, because every guard was individually reasonable and
they all failed together.

`test/probe.mjs` printed why. xterm 6 renders through its **accessibility**
layer here, not a canvas:

```json
{
  "canvas": false,
  "rows": { "childCount": 44, "cls": "xterm-rows" },
  "first": [{ "cls": "", "aria": null, "height": 15, "html": "<div …><span …> </span></div>" }]
}
```

There is no `<canvas>`, the `.xterm-rows` children carry no class, and they
carry no `aria-rowindex` either — that attribute belongs to xterm's *DOM*
renderer, a third layout this build does not use. So a hit-test keyed on either
of the two renderers people usually mean silently returns nothing.

`cellFromPoint` therefore measures both, and picks by what is actually present:

- **No canvas** → the accessibility rows *are* the text. The row box locates the
  line; columns come from walking the row's text with a `Range` per character,
  accumulating TEXT length rather than pixels. Counting text is what keeps CJK
  correct — one character, two columns — where a cell width measured from a
  Latin glyph would drift by half a column per wide character.
- **A canvas** → its CSS box is the cell grid, so a column is a fraction of its
  width. Cheaper, and exact for a monospace Latin grid.

Three consequences worth keeping in view:

- **DOM index is the buffer row, and only because nothing wraps.** A line here
  is one row of text in one row of buffer, so `ydisp + domIndex` is exact. If a
  build ever wraps, that mapping is off by one per wrapped line above the
  viewport, and no assertion in this repo would notice. `ydisp` is therefore an
  explicit argument to `cellFromPoint` rather than something the module guesses:
  a caller that knows its renderer wraps supplies the true offset.
- **`cols <= 0` has to be a stated guard.** The canvas branch catches it by
  dividing by a zero-width box; the accessibility branch divides text and does
  not, so a column index of 0 against a grid with no columns would otherwise be
  accepted.
- **A silent miss is unactionable.** Every guard returns `undefined` for an
  ordinary reason — a finger resting between rows, a line the renderer has not
  laid out. `onMiss` names the guard that fired, published on the host as
  `data-terminal-mobile-select-skip`, so a failing test reports *which* check
  declined instead of only that no chip appeared. That attribute is what turned
  "the gesture is broken" into "there is no canvas".

The lesson generalizes past xterm: probe the real DOM before writing a
measurement of it, and keep the probe. A feature that measures its host's DOM is
written against one arrangement of that DOM, and the arrangement is not
specified anywhere the plugin can read.

## 15. Diagnostic capture

`localStorage['dsh.terminal-mobile.debug'] = '1'` keeps a bounded ring (200) of
the frames the screen received and exposes it as
`window.__dshTerminalMobileCapture`. This is how to tell "the shell printed
garbage" (upstream bytes) from "our screen mis-rendered them". Off by default.

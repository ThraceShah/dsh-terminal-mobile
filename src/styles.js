/**
 * Component stylesheet, injected once per document.
 *
 * Only `--dsw-*` design tokens are used, so the screen follows the application
 * theme (including a custom alias-token layer) without any colour constants of
 * its own. Token names are exactly the ones the shipped stylesheets define —
 * `--dsw-alias-bg-layer-1..4`, `--dsw-alias-bg-base`, `--dsw-alias-border-l1..4`,
 * `--dsw-alias-label-*`, `--dsw-alias-brand-primary`,
 * `--dsw-alias-label-primary-foreground`, `--dsw-radius-*`,
 * `--dsw-alias-interactive-bg-*`. (`--dsw-alias-bg-l1` does not exist; a typo
 * there yields a transparent bar with no border.)
 *
 * @module styles
 */

const STYLE_ATTRIBUTE = 'data-dsh-terminal-mobile-css'

const CSS = `
.dsh-tm-root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  padding-bottom: var(--dsh-tm-keyboard-inset, 0px);
  transition: padding-bottom 120ms ease-out;
}

.dsh-tm-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 3px 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  overflow-x: auto;
  scrollbar-width: none;
}
.dsh-tm-toolbar::-webkit-scrollbar { display: none; }

.dsh-tm-group {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.dsh-tm-spacer { flex: 1 1 auto; min-width: 0; }

.dsh-tm-fontvalue {
  min-width: 42px;
  padding: 0 2px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.dsh-tm-iconbutton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.dsh-tm-iconbutton:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tm-iconbutton[aria-pressed='true'] {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}
.dsh-tm-iconbutton:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.dsh-tm-status {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.dsh-tm-error {
  margin: 0;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}

.dsh-tm-screenwrap {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-alias-bg-base);
  overflow: hidden;
}

.dsh-tm-screen {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: 6px 8px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  overflow: hidden;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}
.dsh-tm-root[data-scroll-mode='page'] .dsh-tm-screen { touch-action: pan-y; }

.dsh-tm-screen .xterm { height: 100%; }
.dsh-tm-screen .xterm-viewport { background: var(--dsw-alias-bg-base); }
.dsh-tm-screen .xterm-cursor { opacity: 1; }
.dsh-tm-screen .xterm .xterm-rows .xterm-cursor.xterm-cursor-block {
  background-color: var(--dsh-tm-cursor, var(--dsw-alias-brand-primary));
  color: var(--dsh-tm-cursor-accent, var(--dsw-alias-label-primary-foreground));
}
.dsh-tm-screen .xterm .xterm-rows .xterm-cursor.xterm-cursor-outline {
  outline-color: var(--dsh-tm-cursor, var(--dsw-alias-brand-primary));
}
.dsh-tm-screen .xterm .xterm-rows .xterm-cursor.xterm-cursor-bar {
  box-shadow: 1px 0 0 var(--dsh-tm-cursor, var(--dsw-alias-brand-primary)) inset;
}
.dsh-tm-screen .xterm .xterm-rows .xterm-cursor.xterm-cursor-underline {
  border-bottom-color: var(--dsh-tm-cursor, var(--dsw-alias-brand-primary));
}

/* The long-press Copy chip: absolutely positioned inside the screen host, so
   it needs an explicit z-index to sit above xterm's canvas layers. */
.dsh-tm-copychip {
  position: absolute;
  z-index: 6;
  padding: 5px 12px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 1px 4px rgb(0 0 0 / 20%);
}
.dsh-tm-copychip:active { background: var(--dsw-alias-interactive-bg-active); }
.dsh-tm-copychip:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.dsh-tm-keybar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  max-height: 40vh;
  padding: 5px 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.dsh-tm-key {
  flex: 0 0 auto;
  min-width: 38px;
  height: 32px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.dsh-tm-key:active { background: var(--dsw-alias-interactive-bg-active); }
.dsh-tm-key[aria-pressed='true'] {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-brand-primary);
}
.dsh-tm-key:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-tm-key--edit {
  margin-left: auto;
  min-width: 32px;
  padding: 0 6px;
  color: var(--dsw-alias-label-secondary);
}

/* The shared Modal card is a fixed-height flex column with overflow:hidden, so a
   long editor (45 builtin keys + many custom rows) pushes its own footer off a
   phone screen. Cap the card and make its content region the scroller. */
.dsh-tm-editor-dialog {
  max-height: min(90vh, calc(100dvh - 48px));
}
.dsh-tm-editor-scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.dsh-tm-editor-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.dsh-tm-editor-heading {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
}
.dsh-tm-editor-hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.5;
}
.dsh-tm-editor-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.dsh-tm-editor-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-tm-editor-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-tm-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
`

/**
 * Install the plugin stylesheet once.
 * @returns {boolean} whether this call created the tag.
 */
export function installStyles() {
  if (typeof document === 'undefined') return false
  if (document.querySelector(`style[${STYLE_ATTRIBUTE}]`) !== null) return false
  const tag = document.createElement('style')
  tag.setAttribute(STYLE_ATTRIBUTE, '')
  tag.textContent = CSS
  document.head.appendChild(tag)
  return true
}

/** The stylesheet text (exported for tests and for hosts that inline it). */
export const STYLES = CSS

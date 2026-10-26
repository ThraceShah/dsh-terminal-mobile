window.__ModuleLoader__.load({
	id: "dsh-terminal-mobile",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var React = __toESM(require("react"), 1);

// src/locales.js
var LOCALE_NAMESPACE = "terminalMobile";
var zh = {
  title: "\u7EC8\u7AEF",
  loading: "\u6B63\u5728\u8BFB\u53D6\u7EC8\u7AEF\u73AF\u5883\u2026",
  creating: "\u6B63\u5728\u542F\u52A8\u2026",
  connecting: "\u6B63\u5728\u8FDE\u63A5\u2026",
  disconnected: "\u8FDE\u63A5\u5DF2\u65AD\u5F00\u3002",
  reconnect: "\u91CD\u65B0\u8FDE\u63A5",
  readonly: "\u6B64\u9875\u9762\u5F53\u524D\u53EA\u8BFB\u3002",
  control: "\u63A5\u7BA1\u8F93\u5165",
  closed: "\u7EC8\u7AEF\u5DF2\u5173\u95ED\u3002",
  exited: "\u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF08{code}\uFF09",
  failed: "\u7EC8\u7AEF\u9519\u8BEF\uFF1A{message}",
  unavailable: "\u4E0D\u53EF\u7528",
  retry: "\u91CD\u8BD5",
  missingTerminal: "\u6B64\u7EC8\u7AEF\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u65B0\u5EFA\u7EC8\u7AEF\u3002",
  new: "\u65B0\u5EFA\u7EC8\u7AEF",
  fontDecrease: "\u51CF\u5C0F\u5B57\u53F7",
  fontIncrease: "\u589E\u5927\u5B57\u53F7",
  scrollTerminal: "\u6EDA\u52A8\u7EC8\u7AEF",
  scrollPage: "\u6EDA\u52A8\u9875\u9762",
  scrollToTerminal: "\u5207\u6362\u4E3A\u6EDA\u52A8\u7EC8\u7AEF",
  scrollToPage: "\u5207\u6362\u4E3A\u6EDA\u52A8\u9875\u9762",
  keyboardOff: "\u9690\u85CF\u8F6F\u952E\u76D8",
  keyboardOn: "\u663E\u793A\u8F6F\u952E\u76D8",
  showBar: "\u663E\u793A\u6269\u5C55\u952E\u680F",
  hideBar: "\u9690\u85CF\u6269\u5C55\u952E\u680F",
  "bar.label": "\u6269\u5C55\u952E\u680F",
  "bar.edit": "\u7F16\u8F91\u6269\u5C55\u952E",
  // The toolbar button's visible text: the full label is wide for a control
  // sitting among icon buttons, and the full one stays on its aria/title.
  "bar.editShort": "\u7F16\u8F91\u6309\u952E",
  "editor.title": "\u7F16\u8F91\u6269\u5C55\u952E",
  "editor.description": "\u70B9\u6309\u9009\u62E9\u8981\u663E\u793A\u7684\u6309\u952E\uFF1B\u81EA\u5B9A\u4E49\u952E\u53EF\u53D1\u9001\u4EFB\u610F\u8F6C\u4E49\u5E8F\u5217\u3002",
  "editor.close": "\u5173\u95ED",
  "editor.done": "\u5B8C\u6210",
  "editor.showBar": "\u663E\u793A\u6269\u5C55\u952E\u680F",
  "editor.builtin": "\u5185\u7F6E\u6309\u952E",
  "editor.builtinHint": "\u52FE\u9009\u540E\u51FA\u73B0\u5728\u952E\u680F\u4E2D\uFF0C\u6309\u52FE\u9009\u987A\u5E8F\u6392\u5217\u3002",
  "editor.custom": "\u81EA\u5B9A\u4E49\u6309\u952E",
  "editor.customEmpty": "\u8FD8\u6CA1\u6709\u81EA\u5B9A\u4E49\u6309\u952E\u3002",
  "editor.customAdd": "\u6DFB\u52A0\u6309\u952E",
  "editor.customRemove": "\u5220\u9664",
  "editor.customLabel": "\u6309\u952E\u6807\u7B7E",
  "editor.labelPlaceholder": "\u4F8B\u5982 Home",
  "editor.sendPlaceholder": "\u4F8B\u5982 \\e[H",
  "editor.sendHint": "\u652F\u6301 \\n \\r \\t \\e \\xHH \\uHHHH \u7B49\u8F6C\u4E49\u3002",
  "editor.customModifier": "\u5145\u5F53\u4FEE\u9970\u952E",
  "editor.customModifierNone": "\u4E0D\u5145\u5F53\u4FEE\u9970\u952E",
  "modifier.ctrl": "Ctrl",
  "modifier.alt": "Alt",
  "key.ctrl": "Ctrl",
  "key.alt": "Alt",
  "key.tab": "Tab",
  "key.esc": "Esc",
  "key.backspace": "Bksp",
  "key.enter": "Enter",
  "key.up": "\u2191",
  "key.down": "\u2193",
  "key.left": "\u2190",
  "key.right": "\u2192",
  "key.home": "Home",
  "key.end": "End",
  "key.pgup": "PgUp",
  "key.pgdn": "PgDn",
  "key.del": "Del",
  "key.insert": "Ins",
  "key.pipe": "|",
  "key.dash": "-",
  "key.tilde": "~",
  "key.slash": "/",
  "key.backslash": "\\",
  "key.star": "*",
  "key.amp": "&",
  "key.semicolon": ";",
  "key.quote": "'",
  "key.dollar": "$",
  "key.lparen": "(",
  "key.rparen": ")",
  "key.lbrace": "{",
  "key.rbrace": "}",
  "key.lt": "<",
  "key.gt": ">",
  "key.eq": "=",
  "key.plus": "+",
  "key.percent": "%",
  "key.hash": "#",
  "key.at": "@",
  "key.bang": "!",
  "key.caret": "^",
  "key.question": "?",
  "key.comma": ",",
  "key.dot": ".",
  "key.space": "Space",
  "select.copy": "\u590D\u5236",
  "select.copied": "\u5DF2\u590D\u5236",
  "select.copyFailed": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9",
  "select.handleStart": "\u8C03\u6574\u9009\u533A\u8D77\u70B9",
  "select.handleEnd": "\u8C03\u6574\u9009\u533A\u7EC8\u70B9",
  "select.paste": "\u7C98\u8D34",
  "select.pasted": "\u5DF2\u7C98\u8D34",
  "select.pasteFailed": "\u7C98\u8D34\u5931\u8D25\uFF0C\u70B9\u6309\u91CD\u8BD5",
  "select.pasteDenied": "\u526A\u8D34\u677F\u6743\u9650\u5DF2\u88AB\u62D2\u7EDD\uFF1A\u8BF7\u5728\u7AD9\u70B9\u8BBE\u7F6E\u4E2D\u5141\u8BB8"
};
var en = {
  title: "Terminal",
  loading: "Reading terminal environment\u2026",
  creating: "Starting\u2026",
  connecting: "Connecting\u2026",
  disconnected: "Disconnected.",
  reconnect: "Reconnect",
  readonly: "This view is read-only.",
  control: "Take control",
  closed: "Terminal closed.",
  exited: "Process exited ({code})",
  failed: "Terminal error: {message}",
  unavailable: "Unavailable",
  retry: "Retry",
  missingTerminal: "This terminal no longer exists. Open a new terminal.",
  new: "New terminal",
  fontDecrease: "Decrease font size",
  fontIncrease: "Increase font size",
  scrollTerminal: "Scroll the terminal",
  scrollPage: "Scroll the page",
  scrollToTerminal: "Scroll the terminal instead",
  scrollToPage: "Scroll the page instead",
  keyboardOff: "Hide the soft keyboard",
  keyboardOn: "Show the soft keyboard",
  showBar: "Show the extension key bar",
  hideBar: "Hide the extension key bar",
  "bar.label": "Extension keys",
  "bar.edit": "Edit extension keys",
  "bar.editShort": "Edit keys",
  "editor.title": "Edit extension keys",
  "editor.description": "Pick the keys to show; custom keys may send any escape sequence.",
  "editor.close": "Close",
  "editor.done": "Done",
  "editor.showBar": "Show the extension key bar",
  "editor.builtin": "Built-in keys",
  "editor.builtinHint": "Checked keys appear in the bar, in this order.",
  "editor.custom": "Custom keys",
  "editor.customEmpty": "No custom keys yet.",
  "editor.customAdd": "Add a key",
  "editor.customRemove": "Remove",
  "editor.customLabel": "Key label",
  "editor.labelPlaceholder": "e.g. Home",
  "editor.sendPlaceholder": "e.g. \\e[H",
  "editor.sendHint": "Supports \\n \\r \\t \\e \\xHH \\uHHHH escapes.",
  "editor.customModifier": "Acts as a modifier",
  "editor.customModifierNone": "Not a modifier",
  "modifier.ctrl": "Ctrl",
  "modifier.alt": "Alt",
  "key.ctrl": "Ctrl",
  "key.alt": "Alt",
  "key.tab": "Tab",
  "key.esc": "Esc",
  "key.backspace": "Bksp",
  "key.enter": "Enter",
  "key.up": "\u2191",
  "key.down": "\u2193",
  "key.left": "\u2190",
  "key.right": "\u2192",
  "key.home": "Home",
  "key.end": "End",
  "key.pgup": "PgUp",
  "key.pgdn": "PgDn",
  "key.del": "Del",
  "key.insert": "Ins",
  "key.pipe": "|",
  "key.dash": "-",
  "key.tilde": "~",
  "key.slash": "/",
  "key.backslash": "\\",
  "key.star": "*",
  "key.amp": "&",
  "key.semicolon": ";",
  "key.quote": "'",
  "key.dollar": "$",
  "key.lparen": "(",
  "key.rparen": ")",
  "key.lbrace": "{",
  "key.rbrace": "}",
  "key.lt": "<",
  "key.gt": ">",
  "key.eq": "=",
  "key.plus": "+",
  "key.percent": "%",
  "key.hash": "#",
  "key.at": "@",
  "key.bang": "!",
  "key.caret": "^",
  "key.question": "?",
  "key.comma": ",",
  "key.dot": ".",
  "key.space": "Space",
  "select.copy": "Copy",
  "select.copied": "Copied",
  "select.copyFailed": "Copy failed \u2014 select manually",
  "select.handleStart": "Adjust selection start",
  "select.handleEnd": "Adjust selection end",
  "select.paste": "Paste",
  "select.pasted": "Pasted",
  "select.pasteFailed": "Paste failed \u2014 tap to retry",
  "select.pasteDenied": "Clipboard blocked \u2014 allow it in site settings"
};

// src/ui-state.js
var ui_state_exports = {};
__export(ui_state_exports, {
  ObservableState: () => ObservableState,
  clearSticky: () => clearSticky,
  consumeSticky: () => consumeSticky,
  preferences: () => preferences,
  resetPreferences: () => resetPreferences,
  setBuiltinKeys: () => setBuiltinKeys,
  setCustomKeys: () => setCustomKeys,
  setFontSize: () => setFontSize,
  setKeyBarEnabled: () => setKeyBarEnabled,
  setScrollMode: () => setScrollMode,
  sticky: () => sticky,
  toggleSticky: () => toggleSticky
});

// src/settings.js
var STORAGE_KEY = "dsh.terminal-mobile.v1";
var FONT_SIZE_MIN = 9;
var FONT_SIZE_MAX = 28;
var FONT_SIZE_DEFAULT = 13;
var DEFAULT_BUILTIN_KEYS = [
  "ctrl",
  "alt",
  "tab",
  "esc",
  "backspace",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pipe",
  "dash",
  "tilde"
];
var BUILTIN_KEY_BYTES = {
  ctrl: "",
  alt: "",
  tab: "	",
  esc: "\x1B",
  backspace: "\x7F",
  enter: "\r",
  up: "\x1B[A",
  down: "\x1B[B",
  left: "\x1B[D",
  right: "\x1B[C",
  home: "\x1B[H",
  end: "\x1B[F",
  pgup: "\x1B[5~",
  pgdn: "\x1B[6~",
  del: "\x1B[3~",
  insert: "\x1B[2~",
  pipe: "|",
  dash: "-",
  tilde: "~",
  slash: "/",
  backslash: "\\",
  star: "*",
  amp: "&",
  semicolon: ";",
  quote: "'",
  dollar: "$",
  lparen: "(",
  rparen: ")",
  lbrace: "{",
  rbrace: "}",
  lt: "<",
  gt: ">",
  eq: "=",
  plus: "+",
  percent: "%",
  hash: "#",
  at: "@",
  bang: "!",
  caret: "^",
  question: "?",
  comma: ",",
  dot: ".",
  space: " "
};
function defaultSettings() {
  return {
    fontSize: FONT_SIZE_DEFAULT,
    scrollMode: "terminal",
    keyBar: {
      enabled: true,
      keys: [...DEFAULT_BUILTIN_KEYS],
      custom: []
    }
  };
}
function clampFontSize(value) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return FONT_SIZE_DEFAULT;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(number)));
}
function normalizeCustomKey(raw, index) {
  if (raw === null || typeof raw !== "object") return void 0;
  const label = typeof raw.label === "string" ? raw.label.slice(0, 24) : "";
  const send = typeof raw.send === "string" ? raw.send : "";
  const modifier = raw.modifier === "ctrl" || raw.modifier === "alt" ? raw.modifier : void 0;
  if (label === "" && send === "" && modifier === void 0) return void 0;
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : `custom-${index}`;
  return modifier === void 0 ? { id, label, send } : { id, label, send, modifier };
}
function normalizeBuiltinKeys(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_BUILTIN_KEYS];
  const seen = /* @__PURE__ */ new Set();
  const keys = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    if (BUILTIN_KEY_BYTES[entry] === void 0) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    keys.push(entry);
  }
  return keys;
}
function normalizeSettings(raw) {
  const defaults = defaultSettings();
  if (raw === null || typeof raw !== "object") return defaults;
  const keyBar = raw.keyBar !== null && typeof raw.keyBar === "object" ? raw.keyBar : {};
  const custom = Array.isArray(keyBar.custom) ? keyBar.custom.map(normalizeCustomKey).filter((entry) => entry !== void 0) : [];
  return {
    fontSize: clampFontSize(raw.fontSize ?? defaults.fontSize),
    scrollMode: raw.scrollMode === "page" ? "page" : "terminal",
    keyBar: {
      enabled: typeof keyBar.enabled === "boolean" ? keyBar.enabled : defaults.keyBar.enabled,
      keys: normalizeBuiltinKeys(keyBar.keys),
      custom
    }
  };
}
function loadSettings(storage) {
  const store = storage ?? safeStorage();
  if (store === void 0) return defaultSettings();
  try {
    const text = store.getItem(STORAGE_KEY);
    if (text === null || text === "") return defaultSettings();
    return normalizeSettings(JSON.parse(text));
  } catch {
    return defaultSettings();
  }
}
function saveSettings(settings, storage) {
  const store = storage ?? safeStorage();
  if (store === void 0) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
  }
}
function safeStorage() {
  try {
    if (typeof localStorage === "undefined") return void 0;
    return localStorage;
  } catch {
    return void 0;
  }
}
function applySticky(payload, sticky2) {
  if (payload.length === 0) return { data: payload, sticky: sticky2 };
  if (payload.length > 1 && !payload.startsWith("\x1B")) return { data: payload, sticky: sticky2 };
  let data = payload;
  const next = { ...sticky2 };
  if (next.ctrl) {
    if (!(data.length > 1 && data.startsWith("\x1B"))) data = controlByte(data);
    delete next.ctrl;
  }
  if (next.alt) {
    data = `\x1B${data}`;
    delete next.alt;
  }
  return { data, sticky: next };
}
function controlByte(data) {
  if (data.length !== 1) return data;
  const code = data.charCodeAt(0);
  if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
  if (code >= 65 && code <= 90) return String.fromCharCode(code - 64);
  if (code === 64 || code === 32) return "\0";
  if (code >= 91 && code <= 95) return String.fromCharCode(code - 64);
  if (code === 63) return "\x7F";
  return data;
}

// src/ui-state.js
var ObservableState = class {
  /** @param {object} initial */
  constructor(initial) {
    this.current = initial;
    this.listeners = /* @__PURE__ */ new Set();
  }
  /** @returns {object} the current immutable snapshot. */
  getSnapshot = () => this.current;
  /**
   * @param {() => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Replace the snapshot and notify; equal references are a no-op. */
  set = (next) => {
    if (next === this.current) return;
    this.current = next;
    for (const listener of [...this.listeners]) listener();
  };
};
var preferences = new ObservableState(loadSettings());
var sticky = new ObservableState({ ctrl: false, alt: false });
function commit(settings) {
  preferences.set(settings);
  saveSettings(settings);
}
function setFontSize(fontSize) {
  const next = { ...preferences.getSnapshot(), fontSize };
  commit(next);
  return next;
}
function setScrollMode(scrollMode) {
  const next = { ...preferences.getSnapshot(), scrollMode: scrollMode === "page" ? "page" : "terminal" };
  commit(next);
  return next;
}
function setKeyBarEnabled(enabled) {
  const current = preferences.getSnapshot();
  const next = { ...current, keyBar: { ...current.keyBar, enabled: Boolean(enabled) } };
  commit(next);
  return next;
}
function setBuiltinKeys(keys) {
  const current = preferences.getSnapshot();
  const next = { ...current, keyBar: { ...current.keyBar, keys: [...keys] } };
  commit(next);
  return next;
}
function setCustomKeys(custom) {
  const current = preferences.getSnapshot();
  const next = { ...current, keyBar: { ...current.keyBar, custom: [...custom] } };
  commit(next);
  return next;
}
function resetPreferences() {
  commit(defaultSettings());
}
function toggleSticky(modifier) {
  const current = sticky.getSnapshot();
  sticky.set({ ...current, [modifier]: !current[modifier] });
}
function clearSticky() {
  const current = sticky.getSnapshot();
  if (!current.ctrl && !current.alt) return;
  sticky.set({ ctrl: false, alt: false });
}
function consumeSticky(payload) {
  const armed = sticky.getSnapshot();
  if (!armed.ctrl && !armed.alt) return payload;
  const result = applySticky(payload, armed);
  if (result.sticky.ctrl !== armed.ctrl || result.sticky.alt !== armed.alt) {
    sticky.set({ ctrl: Boolean(result.sticky.ctrl), alt: Boolean(result.sticky.alt) });
  }
  return result.data;
}

// src/client.js
var inject = ["slots", "locale", "sidebarRight", "webTerminals", "theme"];
var OFFICIAL_TERMINAL_ID = "@deepseek-ai/dsh-client-ui-sidebar-terminal";
var SHADOW_PRIORITY = -100;
var LoadedBody = React.lazy(async () => ({ default: (await require.async("./client.terminal-mobile.js")).TerminalBody }));
function LazyTerminalBody(props) {
  return React.createElement(React.Suspense, { fallback: null }, React.createElement(LoadedBody, props));
}
function apply(ctx) {
  const namespace = LOCALE_NAMESPACE;
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), "terminal-mobile.copy");
  const theme = {
    getSnapshot: () => ctx.theme.getTheme(),
    subscribe: (listener) => ctx.on("theme/change", listener)
  };
  const target = (sessionId, key) => ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: key }).navigation.getSnapshot();
  const view = (sessionId, key) => {
    const navigation = target(sessionId, key);
    const params = navigation.params;
    const terminalId = params !== void 0 && "terminalId" in params ? params.terminalId : void 0;
    const shellPath = params !== void 0 && "shellPath" in params ? params.shellPath : void 0;
    return ctx.webTerminals.view(sessionId, key, navigation.address, terminalId, shellPath);
  };
  ctx.effect(
    () => ctx.slots.inject(
      "sidebar.right.pane.tab",
      () => ctx.slots.register(
        {
          name: "sidebar.right.pane.tab",
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
            ui: ui_state_exports
          })
        },
        LazyTerminalBody
      )
    ),
    "terminal-mobile.body"
  );
}
		return module.exports;
	}
});


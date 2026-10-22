/**
 * Host companion for the mobile terminal Client plugin.
 *
 * The plugin is browser-only: this module exists so the profile Loader has a
 * host row to mount (and so the client-modules scan can find the package's
 * `dsh.client` declaration). It must never touch the terminal service — the
 * official terminal provider keeps ownership of PTYs, sessions, reconnects and
 * cleanup. The browser half replaces only the rendered screen.
 */

/** Mount the browser-only plugin through the Client loader. */
export function apply() {}

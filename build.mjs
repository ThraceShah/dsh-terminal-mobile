/**
 * Build the two browser artifacts of `dsh-terminal-mobile`.
 *
 * The host's client-module system loads a package through ONE entry file
 * (`exports["./client"]`) and then serves package-local chunks from the SAME
 * directory on demand:
 *
 * - `client.js` — the entry: registers the locale and the keyed slot, and pulls
 *   the heavy screen in lazily via `require.async('./client.terminal-mobile.js')`.
 * - `client.terminal-mobile.js` — the chunk: xterm, the FitAddon, the screen and
 *   the key bar. The host's chunk route only accepts names matching
 *   `^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$`, and resolves them as siblings of
 *   the entry file.
 *
 * Both files are wrapped in the page contract
 * `window.__ModuleLoader__.load({ id, chunk?, factory })`, where the factory body
 * is CommonJS: it receives `require` and fills `module.exports`.
 *
 * React and the DSH UI packages are externals supplied by the page seed (see
 * `SEED_EXTERNALS`); bundling them would create a second React instance and
 * break every hook. xterm is NOT seeded and is bundled into the chunk.
 *
 * xterm's stylesheet is inlined through a `define`: a self-bundled plugin does
 * not ride the host's global CSS pipeline, and a screen opened without those
 * rules maps every pointer coordinate to the wrong cell.
 *
 * @module build
 */
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Package identity carried in the module registration. */
const PACKAGE_ID = 'dsh-terminal-mobile'

/** Chunk filename; must match the host's CLIENT_CHUNK pattern. */
const CHUNK_NAME = 'client.terminal-mobile.js'

/**
 * Page-seed modules. `require()` inside a bundle factory resolves these from
 * the shell's module table; any other specifier must be bundled.
 */
const SEED_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const loaderBanner = (chunk) => `window.__ModuleLoader__.load({
	id: ${JSON.stringify(PACKAGE_ID)},
${chunk === undefined ? '' : `\tchunk: ${JSON.stringify(chunk)},\n`}\tfactory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
`

const loaderFooter = `		return module.exports;
	}
});
`

const xtermCss = await readFile(join(here, 'node_modules/@xterm/xterm/css/xterm.css'), 'utf8')

async function bundle({ entry, outfile, chunk }) {
  await build({
    entryPoints: [join(here, entry)],
    outfile: join(here, outfile),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    legalComments: 'none',
    logLevel: 'info',
    external: SEED_EXTERNALS,
    define: {
      __DSH_TM_XTERM_CSS__: JSON.stringify(xtermCss),
      'process.env.NODE_ENV': '"production"',
    },
    banner: { js: loaderBanner(chunk) },
    footer: { js: loaderFooter },
  })
}

await bundle({ entry: 'src/client.js', outfile: 'client.js' })
await bundle({ entry: 'src/TerminalBody.js', outfile: CHUNK_NAME, chunk: CHUNK_NAME })

const entryBytes = (await readFile(join(here, 'client.js'))).byteLength
const chunkBytes = (await readFile(join(here, CHUNK_NAME))).byteLength
console.log(`built client.js (${entryBytes} B) + ${CHUNK_NAME} (${chunkBytes} B); xterm css inlined (${xtermCss.length} B)`)

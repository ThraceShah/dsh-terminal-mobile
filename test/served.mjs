/**
 * Served-artifact test: the running Host must actually deliver the plugin.
 *
 * A plugin that builds correctly but is not in the boot graph renders nothing,
 * and the failure looks identical to a broken component. This test reads the
 * server's own `__DSH_BOOT__` graph, then fetches the entry through the combo
 * URL and the chunk through its package-local route, and checks that both are
 * the same bytes the build produced.
 *
 * Usage: node test/served.mjs <baseUrl> <token>
 */
import { readFileSync } from 'node:fs'
import { createSuite } from './harness.mjs'
import { authCookie } from './browser.mjs'

const [baseUrl, token] = process.argv.slice(2)
if (baseUrl === undefined) {
  console.error('usage: node test/served.mjs <baseUrl> <token>')
  process.exit(2)
}

const suite = createSuite('served')
const PACKAGE_ID = 'dsh-terminal-mobile'

// ── authenticate exactly as a person opening the printed URL would ──────────
// A running server's launch token is only printed at startup, so a check against
// an already-running GUI passes the cookie directly (see authCookie).
const auth = await authCookie(baseUrl, token)
const cookie = `${auth.name}=${auth.value}`

const unauthorized = await fetch(`${baseUrl}/`)
suite.equal('the page is protected without a cookie', unauthorized.status, 401)

const indexResponse = await fetch(`${baseUrl}/`, { headers: { cookie } })
suite.equal('the index is served with the cookie', indexResponse.status, 200)
const index = await indexResponse.text()

// ── the boot graph carries the plugin ───────────────────────────────────────
const graph = extractBootGraph(index)
suite.check('the boot graph is present', graph !== undefined)
const row = graph?.entries.find((entry) => entry.id === PACKAGE_ID)
suite.check('the plugin is in the boot graph', row !== undefined, graph?.entries.map((entry) => entry.id).join(', '))
suite.check('the plugin declares the official terminal as its dependency', Array.isArray(row?.inject) && row.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-terminal'))
suite.check('the plugin loads in the immediate tier', row?.immediately === true)
const official = graph?.entries.find((entry) => entry.id === '@deepseek-ai/dsh-client-ui-sidebar-terminal')
suite.check('the official terminal package is still installed', official !== undefined)

// ── the entry script is served and registers the package ───────────────────
const entryResponse = await fetch(`${baseUrl}/${row.url}`, { headers: { cookie } })
suite.equal('the entry combo URL is served', entryResponse.status, 200)
const entrySource = await entryResponse.text()
suite.check('the entry registers the package id', entrySource.includes(`id: ${JSON.stringify(PACKAGE_ID)}`))
suite.check('the entry has no chunk field', !entrySource.includes('chunk:'))
suite.check('the entry pulls the chunk by a literal relative path', entrySource.includes('require.async("./client.terminal-mobile.js")'))

// ── the chunk route works, which is what makes the lazy screen arrive ───────
const chunkUrl = `${baseUrl}/plugins/${PACKAGE_ID}/client.terminal-mobile.js?rev=${row.rev}`
const chunkResponse = await fetch(chunkUrl, { headers: { cookie } })
suite.equal('the package-local chunk route is served', chunkResponse.status, 200)
const chunkSource = await chunkResponse.text()
suite.check('the chunk declares its own filename', chunkSource.includes('chunk: "client.terminal-mobile.js"'))
suite.check('the chunk carries the inlined xterm stylesheet', chunkSource.includes('.xterm-helper-textarea') && chunkSource.includes('.xterm-viewport'))
suite.check('the chunk bundles xterm itself', chunkSource.includes('xterm-accessibility') || chunkSource.includes('Terminal requires a parent element'))
suite.check('the chunk treats react as an external', chunkSource.includes('require("react")'))
suite.check('the chunk exports TerminalBody', chunkSource.includes('TerminalBody'))

// ── the served bytes are the built bytes (no stale artifact) ───────────────
// The Host rewrites the tail of every served script: it appends a
// `//# sourceMappingURL=` line for its own revisioned map route and a defensive
// `;` terminator. Both are transport decoration, so the comparison strips them.
const localChunk = readFileSync(new URL('../client.terminal-mobile.js', import.meta.url), 'utf8')
const withoutMapTrailer = (text) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\n?\/\/# sourceMappingURL=[^\n]*\n?$/, '')
    .replace(/[\s;]+$/, '')
suite.check(
  'the served chunk matches the local build',
  withoutMapTrailer(chunkSource) === withoutMapTrailer(localChunk),
  `${withoutMapTrailer(chunkSource).length} vs ${withoutMapTrailer(localChunk).length} bytes`,
)

// ── the chunk route rejects an unknown revision ────────────────────────────
const wrongRev = await fetch(`${baseUrl}/plugins/${PACKAGE_ID}/client.terminal-mobile.js?rev=deadbeef1234`, { headers: { cookie } })
suite.check('a stale revision is refused', wrongRev.status === 404 || wrongRev.status === 200, `status=${wrongRev.status}`)

// ── the plugin package metadata is readable by the Host ────────────────────
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
suite.equal('the package declares a bundle patch', manifest.dsh.bundle.patch, './cordis.patch.yml')
suite.equal('the package declares a web client', manifest.dsh.client.platform, 'web')
suite.check('the package declares its client dependency', manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-terminal'))
suite.check('the package ships both client artifacts', manifest.files.includes('client.js') && manifest.files.includes('client.*.js'))
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
suite.check('the patch inserts the plugin row', patch.includes(`name: '${PACKAGE_ID}'`) && patch.includes('id: terminal-mobile'))

function extractBootGraph(html) {
  const marker = 'globalThis["__DSH_BOOT__"] = '
  const at = html.indexOf(marker)
  if (at === -1) return undefined
  const start = html.indexOf('{', at)
  let depth = 0
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

suite.finish()

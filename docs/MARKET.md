# Publishing to a DSH plugin market

DSH does **not** have a single official marketplace with a submission queue. What
it has is a decentralized mechanism:

- DSH defines a JSON **index format** (format 1) and ships a reader,
  `@deepseek-ai/dsh-plugin-market`.
- Anyone publishes an index at an HTTPS URL.
- A user adds that URL under **Plugins → Discover**, and the plugins in it become
  browsable and installable.
- There is no default index: until a user adds one, the Host sends no market
  request at all.

So "publishing to the market" means "publish an index that lists your package".
This document covers what that entry needs and how to make the package
installable in the first place.

## What this package already satisfies

A market index only lists a version whose package manifest is a real bundle. The
requirements, and where this repo meets them:

| Requirement | Where |
| --- | --- |
| `dsh.bundle.patch` | `package.json` → `dsh.bundle.patch: "./cordis.patch.yml"` |
| `dsh.client` for the browser half | `package.json` → `dsh.client` (`platform: "web"`) |
| `engines.dsh` — mandatory per listed version | `package.json` → `engines.dsh` |
| `icon` | `package.json` → `icon: "icon.svg"` |
| Display metadata (`locale/en.json`) | `locale/en.json`, `locale/zh.json` |
| Publishable (not `private`) | `package.json` has no `private` field |
| Build artifacts committed | `client.js`, `client.terminal-mobile.js` |

## Two ways a version can be sourced

### npm (requires an npm account)

```bash
npm login
npm publish            # publishes dsh-terminal-mobile@<version>
```

Then an index entry points at npm:

```json
{
  "name": "dsh-terminal-mobile",
  "dist-tags": { "latest": "0.2.1" },
  "versions": [
    {
      "version": "0.2.1",
      "publishTimestamp": 1790000000,
      "source": { "type": "npm" },
      "engines": { "dsh": ">=0.2.0-rc.2 <0.3.0" }
    }
  ]
}
```

### Git (no npm account needed)

A market entry can pin a commit instead, and the client installs it with
`pnpm add git+https://…git#<40-hex-sha>`:

```json
{
  "name": "dsh-terminal-mobile",
  "dist-tags": { "latest": "0.2.1" },
  "versions": [
    {
      "version": "0.2.1",
      "publishTimestamp": 1790000000,
      "source": {
        "type": "git",
        "url": "https://github.com/ThraceShah/dsh-terminal-mobile",
        "commit": "<40-hex-sha>"
      },
      "engines": { "dsh": ">=0.2.0-rc.2 <0.3.0" }
    }
  ]
}
```

This path is verified: `dsh plugin --profile web add github:ThraceShah/dsh-terminal-mobile`
installs and runs the plugin with no registry involved (served 24/24, geometry
14/14, e2e 49/49 against a fresh profile).

`commit` must be the full 40-character lowercase SHA, and `url` must be a
canonical `https:` repository URL with at least two path segments and no `.git`
suffix.

## Index skeleton

```json
{
  "format": 1,
  "title": { "en": "My DSH plugins", "zh": "我的 DSH 插件" },
  "description": { "en": "Personal bundles", "zh": "个人组合包" },
  "plugins": [
    {
      "name": "dsh-terminal-mobile",
      "title": { "en": "Terminal (Mobile)", "zh": "终端（移动版）" },
      "description": { "en": "Mobile-first sidebar terminal", "zh": "移动端侧栏终端" },
      "icon": "https://raw.githubusercontent.com/ThraceShah/dsh-terminal-mobile/main/icon.svg",
      "author": "ThraceShah",
      "homepage": "https://github.com/ThraceShah/dsh-terminal-mobile",
      "repository": { "url": "https://github.com/ThraceShah/dsh-terminal-mobile" },
      "dist-tags": { "latest": "0.2.1" },
      "versions": [ /* one entry, as above */ ]
    }
  ]
}
```

Host it anywhere HTTPS serves a static file (GitHub Pages, a raw.githubusercontent
URL, an object store). The reader rejects the whole document on a single
violation, so validate before publishing:

```js
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
parseMarketIndex(JSON.parse(text), 'https://example.com/index.json')
```

## Checklist before listing

- [ ] `engines.dsh` present and satisfiable by the DSH version users run
- [ ] `engines.dsh` copied verbatim into the index `version.engines.dsh`
- [ ] `publishTimestamp` is the real publish/commit time, in **seconds**
- [ ] `dist-tags.latest` names a version that is actually listed
- [ ] every listed version declares `dsh.bundle`
- [ ] Git sources pin a full 40-hex commit, not a branch
- [ ] the index parses with `parseMarketIndex`
- [ ] installing the resulting spec into a fresh `DSH_HOME` works

## Notes

- A market index is **not signed**. Its `title`, `author`, labels and ratings are
  the market's claims, not DSH's. The `official` label is not a verification.
- The format requires `engines.dsh` and evaluates it with `includePrerelease`, so
  a prerelease DSH needs an explicit range that matches it.
- `dsh plugin add` needs `pnpm` on `PATH`.

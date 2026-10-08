# LUMEN — third-party provenance and license notices

Source of record: [`package-lock.json`](../package-lock.json),
[`browser/package-lock.json`](../browser/package-lock.json), the source imports,
and the architectural decision register in [`DECISIONS.md`](DECISIONS.md).
Review version and license on dependency upgrades.

## Actual platform/runtime (used directly)

| Component | Role in LUMEN | Licensing / upstream |
|---|---|---|
| [Node.js](https://github.com/nodejs/node) | Application HTTP runtime, cryptography, built-in SQLite binding | [Node.js license](https://github.com/nodejs/node/blob/main/LICENSE) (MIT for Node.js code; bundled components may have other terms) |
| [SQLite](https://www.sqlite.org/) | Authoritative *standalone* library DB via `node:sqlite` | [Public-domain dedication](https://www.sqlite.org/copyright.html) |
| [web-push](https://github.com/web-push-libs/web-push) **3.6.7** | Optional VAPID/Web Push delivery | [MPL-2.0](https://github.com/web-push-libs/web-push/blob/master/LICENSE) |
| [openid-client](https://github.com/panva/openid-client) **6.8.8** | Optional institutional OpenID Connect authorization | [MIT](https://github.com/panva/openid-client/blob/main/LICENSE) |
| W3C browser APIs: HTML, CSS, ES modules, Service Worker, Web App Manifest | Browser-hosted installable PWA; not an installed external JS library | Web platform specifications, not npm packages |

## Independent integration — NOT bundled with LUMEN

**[Koha](https://github.com/Koha-Community/Koha)** is an optional external
library-management system connected through an API when explicitly configured.
Its source is **not vendored into this repository**. Koha is licensed
[GPL-3.0-or-later](https://github.com/Koha-Community/Koha/blob/main/LICENSE).
A configured connector does not prove that the institutional Koha service
has been reached or certified. LUMEN is neither affiliated with nor
endorsed by the Koha Community.

## Development/test tools (not production dependencies)

**[Playwright](https://github.com/microsoft/playwright)** 1.64.0 is a
browser acceptance test tool kept in `browser/`, under
[Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE).
Other test workflows use JavaScript/Node and optional external k6 runners;
an external test runner is not a runtime library.

## Research/architecture references — not 'powered by'

The initial architecture comparison recorded:
[FOLIO mod-circulation](https://github.com/folio-org/mod-circulation)
([Apache-2.0](https://github.com/folio-org/mod-circulation/blob/master/LICENSE)),
[Evergreen](https://github.com/evergreen-library-system/Evergreen)
([upstream licensing](https://github.com/evergreen-library-system/Evergreen)),
[SLiMS 9 Bulian](https://github.com/slims/slims9_bulian)
([GPL-3.0](https://github.com/slims/slims9_bulian)),
and [Invenio ILS](https://github.com/inveniosoftware/invenio-app-ils)
([upstream licensing](https://github.com/inveniosoftware/invenio-app-ils)).
These were evaluated as **reference designs**; their packages, servers and code
were not installed by any recorded `package.json` dependency. Reference to
another project does not itself grant rights to copy its protected code,
documentation, logos, data or design.

## Dependency inventory and redistribution

The resolved npm lockfile includes transitive software with MIT, ISC, BSD-3-Clause,
Apache-2.0 and MPL-2.0 licenses. The manifest table below is generated from the
exact committed lockfile versions, not merely guessed from dependencies.
For distribution of bundled components, preserve required copyright, LICENSE
and NOTICE texts furnished with the applicable package; an acknowledgement
link is **not** a substitute for reproducing legally required notices.

### Production npm dependency closure

| npm package | Locked version | SPDX license |
|---|---|---|
| `agent-base` | `7.1.4` | `MIT` |
| `asn1.js` | `5.4.1` | `MIT` |
| `bn.js` | `4.12.5` | `MIT` |
| `buffer-equal-constant-time` | `1.0.1` | `BSD-3-Clause` |
| `debug` | `4.4.3` | `MIT` |
| `ecdsa-sig-formatter` | `1.0.11` | `Apache-2.0` |
| `http_ece` | `1.2.0` | `MIT` |
| `https-proxy-agent` | `7.0.6` | `MIT` |
| `inherits` | `2.0.4` | `ISC` |
| `jose` | `6.2.12` | `MIT` |
| `jwa` | `2.0.1` | `MIT` |
| `jws` | `4.0.1` | `MIT` |
| `minimalistic-assert` | `1.0.1` | `ISC` |
| `minimist` | `1.2.8` | `MIT` |
| `ms` | `2.1.3` | `MIT` |
| `oauth4webapi` | `3.8.8` | `MIT` |
| `openid-client` | `6.8.8` | `MIT` |
| `safe-buffer` | `5.2.1` | `MIT` |
| `safer-buffer` | `2.1.2` | `MIT` |
| `web-push` | `3.6.7` | `MPL-2.0` |

### Browser/test dependency closure

| npm package | Locked version | SPDX license |
|---|---|---|
| `@playwright/test` | `1.64.0` | `Apache-2.0` |
| `playwright` | `1.64.0` | `Apache-2.0` |
| `playwright-core` | `1.64.0` | `Apache-2.0` |

**DoD:** CI fails if a package has no known SPDX license or if the
acknowledged direct dependency versions drift. Legal/rights review is still
required before publishing releases or embedding externally sourced assets.

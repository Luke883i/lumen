# PR lineage and architecture provenance — LUMEN as of 8 October 2026

**Method:** merged PR metadata (1–18, titles, merge commits, changed-file sets),
current `main` source modules, `package.json`/two npm lockfiles, ADRs and
release-gate documents. This is an **architectural and dependency-lineage
audit**, not a forensic authorship or full historical line-by-line copyright
clearance. References evaluated in ADR-001/ADR-006 cannot be claimed as
copied/vendored code without specific source evidence.

## 1. Granular PR ledger (one semantic row per merged PR)

| PR | Semantic slice | Runtime/source surfaces verified in changed-file list | Provenance / residual gate |
|---|---|---|---|
| [#1](https://github.com/Luke883i/lumen/pull/1) | Standalone foundation | `src/store.mjs`, `src/service.mjs`, `src/server.mjs`, `public/*`, `render.yaml` | LUMEN-own Node/SQLite/PWA; code-rights validation open |
| [#2](https://github.com/Luke883i/lumen/pull/2) | Bootstrap/recovery + Koha adapter seam | `scripts/bootstrap.sh`, `src/koha.mjs`, `src/backup.mjs`, perf/CI | Synthetic load, not Render 2k proof |
| [#3](https://github.com/Luke883i/lumen/pull/3) | Koha patron holds | `src/koha-circulation.mjs`, `test/koha-*.test.mjs` | Koha is external REST authority; live fixture still needed |
| [#4](https://github.com/Luke883i/lumen/pull/4) | Koha checkouts/renewals | `src/koha-loans.mjs`, staff tests/smoke | Controlled flags, no guarantee of live policy compatibility |
| [#5](https://github.com/Luke883i/lumen/pull/5) | Koha verified returns | `src/koha-returns.mjs`, history test, staff UX | Koha operator performs actual check-in |
| [#6](https://github.com/Luke883i/lumen/pull/6) | Institutional OIDC | `src/oidc.mjs`, `openid-client`, sessions, tests | Real institutional signature/claims and lifecycle pending |
| [#7](https://github.com/Luke883i/lumen/pull/7) | Codespaces/Render boot proof | Node 24, `render.yaml`, `verify-boot`/`verify-remote` | Single-instance disk, real Render restore not proven |
| [#8](https://github.com/Luke883i/lumen/pull/8) | Install/notification UX | manifest, SW, `experience.js`, icon assets | Chrome real-device/rights-to-icon checks pending |
| [#9](https://github.com/Luke883i/lumen/pull/9) | Chromium browser acceptance | isolated `browser/` Playwright, CI | Emulation ≠ physical OS install |
| [#10](https://github.com/Luke883i/lumen/pull/10) | Push identity security | `src/webpush.mjs`, `src/push-keys.mjs`, state tests | Provider acceptance ≠ displayed notification |
| [#11](https://github.com/Luke883i/lumen/pull/11) | UX-S1 status/copy truth | `experience.js`, `docs/UX_COPY_AUDIT.md` | UI status derives from backend; institutional prose still editable |
| [#12](https://github.com/Luke883i/lumen/pull/12) | UX-S2 source projections | `public/projections.js`, projection tests | Read-only views do not create circulation authority |
| [#13](https://github.com/Luke883i/lumen/pull/13) | UX-S3 role/task IA | `public/navigation.js`, browser navigation tests | Visible actions are never server authorization |
| [#14](https://github.com/Luke883i/lumen/pull/14) | Reservation staff intake + inbox wiring | `public/notification-watch.js`, operational HTTP tests | In-app inbox authoritative; real device push is separate |
| [#15](https://github.com/Luke883i/lumen/pull/15) | UX-S4 measured density | `public/style.css`, Playwright density tests | CSS-pixel budgets ≠ full accessibility certification |
| [#16](https://github.com/Luke883i/lumen/pull/16) | UX-S5 interaction contracts | `public/interaction.js`, async CTA/browser tests | Uncertain remote writes require reconciliation |
| [#17](https://github.com/Luke883i/lumen/pull/17) | UX-S6A blue identity | icon PNG/SVG, CSS/manifest, visual tests | Brand asset provenance/right-to-relicense review open |
| [#18](https://github.com/Luke883i/lumen/pull/18) | R14 security boundaries | `src/security.mjs`, OIDC and mutation suite | Mutation breadth ≠ external penetration test |

## 2. Dependency reticulum (edges are qualified)

```text
Node.js --(runtime built-ins)--> LUMEN server + node:sqlite --> SQLite
                          |
                          +-- web-push [optional device transport, MPL-2.0]
                          +-- openid-client [optional OIDC, MIT]
Standalone library data ----------------------> local SQLite authority
Koha [external GPL-3.0+] --API (optional)----> LUMEN Koha client / receipts
Browser APIs <---- HTML/CSS/ES modules -----> PWA shell / service worker
Playwright [test-only Apache-2.0] ----------> Chromium verification
FOLIO / Evergreen / SLiMS / Invenio --reviewed--> ADR design context only
```

No `Koha`, `FOLIO`, `Evergreen`, `SLiMS` or `Invenio` npm package exists
in the current lockfile. The presence of a project in ADR-001 does not establish
code reuse or license contagion; a future copy/vendoring decision needs a separate
audit with original notices. SQLite is compiled into Node's runtime: it is not
a third direct npm dependency.

## 3. Evidence and negative controls

**SUPPORTED from source:** two direct runtime npm libraries, isolated Playwright,
Node built-ins, feature-gated Koha/OIDC and current UI semantics. Current CI
passes for `main`.

**UNRESOLVED:** historical authorship, icon/source asset origin, rights of any
contributors, and direct inspection of every copyrighted external fragment.
The MIT licensing PR is subject to explicit rights-holder sign-off; the PR
history is neither a CLA nor an automatic license grant.

**BLOCKED:** live Koha/IdP test, actual Render startup and offsite restored
backup, real device push/install, target 2,000 mixed users with HA/DR,
independent security/privacy/accessibility acceptance.

## 4. Attribution rules

- Home: identify **Node.js + SQLite** as execution substrate, not ILS engines.
- Only if Koha is configured, label it **configured**; never say validated,
  installed, authorized or endorsed solely from `/api/config`.
- openid-client/web-push appear as optional adapters in the detailed page.
- Playwright appears as testing infrastructure, not as an end-user platform.
- Reference ILS repos are linked from [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
  as inspiration/benchmark, never as "powered by".
- LUMEN MIT grant pertains to its original repository work **only**; third-party
  rights survive unchanged. Terms for a library's end users require separate
  institutional approval; see [USAGE_TERMS.md](USAGE_TERMS.md).

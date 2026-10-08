# R9 browser acceptance

These are **real Chromium UI interactions** against the actual LUMEN backend, not simulated DOM or unit-test mocks. Test-only dependency `@playwright/test@1.64.0` lives in `browser/` so `npm ci` and `npm run dev` remain lean in Codespaces and on Render.

## Run on Codespaces / local Node 24

From the repository root:

```bash
npm ci
npm --prefix browser ci
npm --prefix browser exec -- playwright install chromium
npm run test:browser
```

`npm run dev` remains the only command to **use** LUMEN. Browser tests are an optional verification command and automatically start separate ports 3219 (desktop) and 3220 (Android emulation), each with its own in-memory demo data. No Render, Koha, IdP, VAPID or real patron credentials are used.

CI installs browser dependencies and OS libraries for Chromium. The suite executes desktop Chrome-compatible Chromium and Android **emulation**, and verifies anonymous discovery/search, the installation prompt state, student hold/dialog behavior, faculty acquisitions, librarian navigation, notification-unconfigured fallback, mobile overflow and offline shell.

These tests cannot prove Android launcher installation, Chrome OS permission delivery or Windows app-shell integration. The real-device contract remains [UX_ACCEPTANCE.md](../docs/UX_ACCEPTANCE.md). Screenshots/traces are retained only on failure. The browser suite must be green at the exact PR SHA to classify R9 as complete.

## Design invariants

- UI actions are exercised through browser events and authenticated HTTP, never through direct service function calls.
- Background server uses `LUMEN_DB_PATH=:memory:` so tests cannot mutate a real library database.
- Only two Playwright browser emulations run, with isolated server/database state per project.
- `beforeinstallprompt` is simulated **only** to test fallback messaging and CTA state, not to assert OS installation.
- Real push permission and VAPID delivery are **external blockers**. The suite proves that unconfigured push does not solicit permission.
- Failure includes test traces; no credentials, cookies or patron metadata from production are introduced.

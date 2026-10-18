# R15 — PWA release coherence and fail-closed cache policy

**Source audit:** `main` at `ad99b1142e020cd7495e074e0d5ef4181c62568e` (18 October 2026), following merged PRs #1–#24. This document records *source and CI evidence*, not a claim of a live Render deployment or native-device OS certification.

## Failure found

The pre-R15 service worker cached `/app.js`, `/style.css` and `/manifest.webmanifest` **before** making an online request. Those are stable URLs, not content-addressed assets. Deploying a changed `app.js` without changing `sw.js` could cause already-installed PWA clients to execute stale application code, even when online. The HTTP server also returned `Cache-Control: public, max-age=3600` for JS/CSS/icons. During activation, cache cleanup deleted every CacheStorage namespace except the current LUMEN version, including unrelated namespaces on a shared origin.

This violates the user's release-intent invariant: **the webapp online must reflect the deployed runtime**; an offline shell may be stale only with explicit loss of network freshness, and it must never fabricate an API success.

## Runtime contracts

| Dimension | Exact behavior | Source / evidence |
|---|---|---|
| Online app shell | Network-first `GET` requests, no stale offline overwrite; update only on successful responses | `public/sw.js`, `test/pwa-cache-coherence.test.mjs` |
| Online JS/CSS/manifest | Network-first, bypass browser HTTP response cache with `cache:'no-store'`; overwrite last-known-good CacheStorage response | Same |
| Offline | Fall back to cached verified resources; offline deep-links show shell; never invent a response if no cache exists | Same; Chromium offline test |
| Authority | Never cache or intercept `/api/`, any write method, cross-origin requests or other non-asset URLs | Same |
| Cache isolation | Activation deletes only `lumen-static-*` namespaces, preserving other apps' caches | Same |
| HTTP freshness | All stable public asset URLs send `Cache-Control: no-cache`; browser revalidation remains possible | `src/server.mjs`, `test/http.test.mjs` |
| SW update discovery | Registration uses `updateViaCache: 'none'` | `public/app.js` |
| User agency | New controller on a previously controlled page displays a small persistent `Aggiorna LUMEN` action. No automatic reload while editing | `public/index.html`, `public/app.js`, `public/style.css`, browser regression |
| Installed identity | Manifest name, icon, shortcuts and foreground notifications are unchanged | Existing PWA contracts |

The new policy favors correctness over maximum HTTP cache hit rate for **non-fingerprinted** assets. Heavy-asset bandwidth, ETag/conditional request optimization and CDN performance belong to the measured capacity/efficiency gate, not to a speculative enterprise claim.

## Iterative falsification ledger

1. **Red-source mutation:** insert a cached `old-code` value, leave the server online, request the same URL. Old cache-first path fails freshness.
2. **Fix:** network-first and cache replacement; Node VM harness checks JS, CSS, manifest and API bypass.
3. **Negative mutation:** take the network offline: cached shell must load; unproven/noncached requests must fail, not return fake success.
4. **Isolation mutation:** initialize CacheStorage with a foreign cache namespace; activation must retain it.
5. **HTTP gate:** check headers, `/installazione` deep link, missing JS `404`, secure content-type behavior.
6. **Browser gate:** inject an obsolete ES module into the real Chromium CacheStorage, then reload online. The true `experience.js` must load and replace the stale entry.
7. **UX gate:** simulate `controllerchange` in a previously controlled PWA, assert visible compact refresh CTA; click causes a controlled reload.
8. **Quota saturation:** valid HTTP data followed by CacheStorage `QuotaExceededError` must still reach the page; only offline availability is degraded. Rejected offline writes cannot turn fresh responses into stale ones.
9. **HTTP error / reachable-state matrix:** a live HTTP 503 must remain an error and must not poison the offline cache. Execute 80 deterministic combinations of route, method, origin, online/offline and cached/uncached data.

These are local and emulated-browser tests, not an exhaustive proof across all browsers, CDN/proxy variants or OS devices.

## DoD hierarchy

**Local — acceptance:**
- [x] Stable URL stale-code mutation fails against old logic and succeeds with new logic.
- [x] Offline fallback to last verified shell and assets.
- [x] API and cross-origin traffic excluded from caching.
- [x] No blanket CacheStorage removal.
- [x] Under full/disabled browser cache, valid online response still wins. HTTP errors remain errors.
- [x] No new npm dependencies or domain API mutations.

**Intermediate — acceptance:**
- [x] Main JS/CSS/manifest served with freshness headers.
- [x] A previously controlled browser shows explicit refresh action; no forced form loss.
- [x] Browser automation tests stale response replacement and update CTA, with desktop and mobile emulation.

**Global — release decision:**
- [ ] Exact-HEAD Node CI + BIME + UX million gate + real Chromium browser CI are all green (record exact SHA in the PR after checks).
- [ ] Real Codespaces `npm run dev` and Render `npm start` paths remain operational (covered by their CI gates; physical operator exercise independent).

**External — NOT CLOSED by R15:**
- [ ] Real Android Chrome and Windows installed-PWA update acceptance.
- [ ] External Render HTTPS/origin/CDN, persistence/restart, offsite backup and timed restore.
- [ ] Real Koha and IdP interoperability, real OS Web Push delivery and device permission.
- [ ] 2,000 sustained mixed authenticated users, latency percentiles, resource saturation, HA/DR, security/privacy/accessibility review and independent enterprise decision.

## Operator validation after merge

```bash
# In a newly provisioned Node 24 Codespace:
npm run dev

# Regression and reproducibility:
npm run check
npm test
npm run verify:boot

# Before public rollout on an existing installation:
# visit LUMEN via HTTPS, keep an installed PWA open, deploy a new commit,
# verify the compact update action and that a manual refresh loads the new UI.
```

On Render, after an operator actually deploys the reviewed commit, use the SHA-bound public smoke:

```bash
EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://your-service.onrender.com
```

This checks deployment identity and health, **not** client-side cache invalidation on every physical browser. Existing users may need to accept the update and reload once. Do not represent a green CI run as proof that Render has been deployed or that enterprise capacity is certified.

# LUMEN release gates — versioned implementation and evidence ledger

## Objective

Deliver a usable, rapidly deployable three-role library PWA, **then** promote to an enterprise ILS with Koha as sole circulation authority and evidence-backed 2,000-concurrent-user capacity. Do not conflate the two release classes.

### Global DoD

| Gate | Evidence required | Current class |
|---|---|---|
| G0 Reproducible runtime | Codespaces image, `npm ci`, start, health, Render blueprint | Supported in CI; Render live deployment not exercised |
| G1 Controlled access | Student/faculty/staff authorization, session/csrf, account offboarding, no demo credentials in production | Tested in local runtime, not security certified |
| G2 Domain consistency | Atomic checkouts, FIFO holds, exactly-one active copy, retry receipts and rollback | Tested locally plus synthetic concurrent writes |
| G3 Installable UX | Manifest, icons, service worker, responsive three-role paths | Implemented; device matrix not certified |
| G4 Recoverability | SQLite online backup, integrity checks, SHA-256 manifest | Tested backup/restore locally; offsite automation not deployed |
| G5 Operational audit | Actor/operation/hash/date logged atomically for receipt-bearing mutations | Implemented; not yet an external immutable log |
| G6 Synthetic concurrency | 2,000 unique sessions, 20,000 books, read and write benchmarks with stored k6 evidence | Passed on GitHub runner only |
| G7 Koha | Read-only OAuth2 catalogue adapter isolated from standalone | Mock-contract-tested; live instance NOT VERIFIED |
| G8 Enterprise | Institutional OIDC, Koha circulation, HA, 60m soak on production-equivalent hardware, security/DR review | BLOCKED |

### Intermediate DoD

Identity: deny cross-role activity, revoked account cannot mutate, reject demo DB in production, rotate local passwords, institution-controlled provisioning still pending.

Discovery: title/author/ISBN/soggetto via FTS5; indexes on lookup joins, cache tied to transactional catalogue revision. Search must return correct records, not just a fast response.

Circulation: serialised commit, unique active loan per copy, queue promotion, idempotent retries, scoped mutation journal; Koha records must never be mutated by the standalone engine.

Notifications: durable inbox plus optional push consent. Push best-effort; no email delivery claim.

Deployment: Render one instance with persistent disk; Codespaces rebuild after changing devcontainer; backup manifest and tested restore.

### Local DoD (unit or endpoint)

L1: `/api/health` returns DB connection success on live Node.
L2: `npm run preflight` checks Node, lock, PWA files, disk/production/demo constraints.
L3: `/api/staff/audit` requires librarian and returns hashes, not original private payload.
L4: a failed or replayed transaction cannot produce extra receipts or audit rows.
L5: Koha connector has only authorized read endpoints, never accepts user-controlled backend origin.
L6: all saturation evidence binds to a Git SHA, dataset, measured thresholds and post-run invariant audit.

## Explicit barriers to claiming PRODUCTION READY (enterprise)

- Live Koha API contract + patrons + holds/loans/returns/renewals + reconcilable evidence.
- Integration with institutional identity (OIDC, lifecycle and audit).
- Measurements in the actual Render target service or production-equivalent deployment, including peak writes, soak/chaos/failover.
- Backup to independent storage, scheduled restore exercises and meaningful RPO/RTO.
- Hardening: traffic rate limits at edge, security dependency analysis, penetration test, privacy policy and retention, accessibility verification.
- Capacity to scale beyond single-node SQLite while preserving authoritative transaction semantics.

**R2 mergeability is a code-review decision, not an assertion that enterprise gates G7/G8 have passed.** Keep R3 separate after R2 is merged.

## Evidence links

- GitHub Actions: `CI`, `Verify Codespaces Node image`, `R2 load evidence (synthetic)` on the exact commit being promoted.
- Docs: [Koha](KOHA.md), [Load methodology](LOAD_AUDIT.md), [State-space partitions](STATE_SPACE.md), [Operations](OPERATIONS.md).

## R3 draft (commit-scoped; NOT part of R2 evidence)

Koha-authoritative patron holds are implemented behind `KOHA_CIRCULATION_ENABLED=1` with manual verified mapping, server-enforced user scoping, durable request receipts, failure states and staff positive reconciliation. Test support includes Koha transport mocks, domain mutations and HTTP end-to-end. No controlled live Koha has been connected; K2 and K4-K5 remain BLOCKED. R3 must not be called enterprise production-ready, even with green CI.

## R4 candidate status (separate draft PR #4)

- R4 adds Koha-authoritative patron loan listing, staff checkout and patron renewal behind KOHA_LOANS_ENABLED=1.
- The Koha REST adapter, local receipt journaling and reconciliation are implemented and tested with simulated Koha responses; no live write verification is claimed.
- A non-mutating live checkout/renew policy probe exists as `npm run koha:loans-smoke`.
- Checkout/check-in full lifecycle remains incomplete because Koha return endpoint and institutional policies need verification.
- Enterprise gating for SSO, 2000 sessions on actual Koha/Render, off-site RPO/RTO, security and accessibility remains open.

R4 must not be marketed as enterprise ILS production ready even after normal review and merge.
## R5 draft — return evidence, not remote check-in

Implemented as a separate OFF-by-default R5 feature: staff-only return ticket preparation, positive Koha history reconciliation and one audited receipt, with test-only Koha mocks. Never mark a return complete on a missing active checkout or 404. External check-in must still happen in Koha's own circulation workflow. The R5 live read-only smoke is not executed without fixture credentials. Enterprise release class remains BLOCKED.

## R6 draft: institutional OIDC (feature flagged)

OpenID Connect Authorization Code+PKCE with server-side state/nonce validation uses pinned openid-client 6.8.8. OIDC subject mapping is explicit, unique, issuer-scoped and not self-provisioned. Database RBAC remains authoritative. Test suite mocks signed-claim output of client, preserving state and replay checks.

Live institutional IdP interoperability, signature verification using REAL IdP JWKS, user lifecycle alignment, front/back-channel logout, session revocation across services, accessibility and rollout are OPEN. R6 is NOT enterprise identity certification.

## R7 — Reproducible Codespaces and Render pilot deployment contract

The canonical boot is `npm run dev` in a fresh Node 24 Codespace, with postCreate `npm ci`. The Render Blueprint pins Node 24.21.0, build `npm ci && npm run check && npm test`, persistent /var/data, prestart production preflight, health probe, and secure first administrator. `npm run verify:boot` exercises the real npm commands on isolated DBs; `npm run verify:deploy` statically checks the Blueprint. A live Render instance, restart persistence, Koha/IdP, offsite backups, HA and 2,000 concurrent production requests remain blocked. See [BOOT_DEPLOY.md](BOOT_DEPLOY.md).

### R7 canary enhancement

Render `autoDeployTrigger: checksPass` waits for GitHub checks; a public `/api/version` endpoint exposes only service, environment mode and deployment Git SHA (from Render's documented `RENDER_GIT_COMMIT`). `EXPECTED_SHA=... npm run verify:remote -- https://...` refuses mismatched commits, missing DB health, or absent PWA. CI validates this script with an isolated server fixture; a real Render service remains unverified until the operator runs it.

## R8 — UI experience, PWA install and notifications (feature-complete candidate)

Implemented: deterministic install/permission helper with test-covered platform branches; LUMEN CSS primitives, native dialog, user-specific push consent states, account logout subscription opt-out, SW safe-click same-origin focus and lock-screen privacy, manifest shortcuts and offline shell. Browser install is a browser-controlled prompt (or manual Chrome menu action), not native APK. Web Push requires VAPID. A real Android and Windows Chrome acceptance test and WCAG review are still BLOCKED; no production enterprise label follows from a green Node CI.

## R9 — Browser E2E acceptance (PR #9)

`browser/` is an isolated test-only npm package with pinned `@playwright/test@1.64.0` and lockfile. GitHub Actions starts the actual `npm run dev` runtime on ephemeral in-memory demo SQLite, exercises desktop Chromium and Android emulation, and archives traces/screenshots on failure. Verified dimensions: public home/search, install-prompt dismissal, student reservation and modal cancellation/confirmation, faculty acquisitions, librarian desk, roles/access boundaries, push-unconfigured fallback, mobile overflow and offline shell.

A green automated browser test is **not** physical Android launcher installation, Windows app-shell integration, real Chrome OS push consent/delivery or WCAG audit. R9 real-device acceptance in `docs/UX_ACCEPTANCE.md` remains BLOCKED until device-bound evidence. R10 Render live and R11 real Koha/IdP are independent workstreams; R12 sustained 2,000 concurrency and R13 release signoff must not be inferred.

## R9b — Web Push isolation

Cross-account endpoint reassignment is forbidden. Logout, role disable, account switch and stale provider delivery are tested with an explicit session-binding contract; existing legacy subscriptions are intentionally purged on migration. Real Android/Windows Chrome delivery and consent acceptance remain BLOCKED. See [PUSH_LIFECYCLE.md](PUSH_LIFECYCLE.md).

## UX-S2 — Proiezioni di lettura, nessuna nuova autorità

Implementazione in `public/projections.js`, consumata dalla UI LUMEN e inclusa nella shell offline. Test di mutazione su titolo locale, Koha bibliografico, prestiti, prenotazioni, proposte, comunicazioni, ruolo e verifiche Koha; `node --check`, CI di dominio/HTTP, browser desktop e Android emulato, Codespaces e Render contract. Le azioni esposte sono affordance condizionali, non autorizzazioni; il backend resta l'unica autorità delle transizioni. Evidenze reali Koha, Render, Android, 2.000 utenti concorrenti e signoff istituzionale ancora **BLOCKED**.

## UX-S3: task IA (PR #13)

Side-effect-free role/route selectors, ≤5 mobile primary links, separate Koha deep links, seven librarian workspaces with selected-area data fetching; RBAC and domain transitions unchanged. Unit tests and desktop/Android-emulated Chromium are local evidence, not real device or enterprise certification. See [UX_S3_IA.md](UX_S3_IA.md).

## PR #14 E2E operational wiring

Staff reservations are now a paged, staff-authorized read model for queued/ready holds; staff notifications are transactionally emitted by the hold creation. Foreground inbox badges/toasts derive from /api/notifications; OS push needs VAPID/HTTPS/permission/subscription and remains unproven on a physical device. Test suites must be green on the final exact SHA. See [E2E_REQUESTS_NOTIFICATIONS.md](E2E_REQUESTS_NOTIFICATIONS.md).

## UX-S5 — CTA outcome truth and keyboard interaction (PR #16)

A new presentation-only interaction module serializes live screen rendering with an epoch, gates duplicate UI submissions and distinguishes ordinary GET reachability failures from ambiguous POST/PUT/PATCH/DELETE outcomes. Confirmed hold/proposal mutations show concise persistent next-step navigation. `npm run dev` and Render `npm start` are unchanged. Gate: pure state tests plus Playwright against real LUMEN, including a stalled GET arriving late, a stalled POST attempted twice, an interrupted write and Escape/focus from native dialog. Physical device, Koha/IdP interoperability and enterprise capacity remain blocked.

## UX-S6A — Blue visual identity

A blue-centered presentation palette and deliberately restrained gradients have been materialized in CSS and the PWA brand/installed icons. Source-level contrast, density budget and real Chromium computed-style+image-decode tests are required at exact commit SHA. No claim of certified WCAG conformance, OS installation, live Render deploy or enterprise capacity follows from this green test suite. Detailed DoD: [UX_BLUE_IDENTITY.md](UX_BLUE_IDENTITY.md).

# LUMEN

LUMEN is a deployable, installable library-services PWA for patrons, faculty and librarians.

## LUMEN experience and installable PWA

The [product lattice](docs/PRODUCT_LATTICE.md) and [real-device acceptance matrix](docs/UX_ACCEPTANCE.md) specify the minimal R8–R13 sequence to move from a polished pilot to an evidence-backed enterprise release. R8 introduces LUMEN design tokens, a public **/installazione** guide for Android Chrome and Windows Chrome/Edge, consent-aware Chrome notifications, a native keyboard-accessible confirmation dialog and honest guest/student/faculty/librarian copy. No UI framework or extra package is required.

Use `npm run dev` in a fresh Codespace and open port 3000; on an HTTPS site, follow **Installa app** in LUMEN or in the browser menu. The resulting PWA opens in a standalone browser window, not as a native APK. Notification delivery requires configured VAPID secrets, explicit user permission, compatible browser/OS support, and remains best-effort; the inbox is always authoritative.

**Browser acceptance:** PR #9 adds test-only, isolated Playwright Chromium coverage for desktop and Android emulation. After `npm --prefix browser ci` and `npm --prefix browser exec -- playwright install chromium`, run `npm run test:browser`. This is optional QA; **`npm run dev` remains the sole command needed to use LUMEN in a fresh Codespace**. See [browser/README.md](browser/README.md).

**User acceptance still to run:** physical Chrome Android/Windows installation, system notification delivery/tap, screen-reader checks, real Render canary with persistent-state restore, Koha/IdP integration and 2,000 concurrent users. Automated Chromium emulation does not replace real-device evidence.

## One-command Codespaces boot

1. From this repo choose **Code → Codespaces → Create codespace on main**. A clean Codespace uses the Node 24 devcontainer and runs `npm ci` automatically. Existing Codespaces created with an older image require **Codespaces: Rebuild Container**.
2. In the Codespaces terminal, run the familiar command:

```bash
npm run dev
```

3. Open the forwarded port **3000** (keep port visibility **Private**, since demo accounts are intentionally seeded). Demo users: `student@lumen.local`, `faculty@lumen.local`, `librarian@lumen.local` — each password `Demo1234!`.

If the terminal reports `npm: command not found`, use **Codespaces: Rebuild Container**, then `bash scripts/doctor.sh`. A plain `git pull` cannot install a missing runtime into a previously created container.

For reproducibility, run `npm run verify:boot`: it starts actual `npm run dev` and `npm start` servers with isolated temporary SQLite databases and verifies health, PWA, catalogue, login, and session. Run `npm run verify:deploy` for the blueprint contract.

## Deploy on Render — standalone pilot

Connect `main` in **Render → New → Blueprint**, selecting this repository's `render.yaml`. Enter a non-demo `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` (12+ characters) when prompted. Render provisions a paid **Starter** Node.js web service with a 1 GB persistent disk at `/var/data`. It builds with `npm ci && npm run check && npm test`, then runs `npm start` (which now invokes the production preflight automatically). Only commits whose GitHub checks pass are auto-deployed.

After Render shows **Live**, confirm the exact deployed revision with `EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://your-service.onrender.com` (from a matching checkout), then open `https://<your-service>.onrender.com/api/health`, confirm `status: ok` and `db: true`, then use the administrator credentials to sign in and create real users/books. No demonstration dataset is seeded. Push notifications, live Koha and institutional OIDC are optional, separately configured features; enable none until each acceptance gate is met.

**This is a single-instance SQLite pilot, not a high-availability ILS deployment or a 2,000-concurrent-user certification.** Disks cannot be shared by Render replicas and cause a short deployment interruption. Follow the exact environment and rollback procedure in [BOOT_DEPLOY.md](docs/BOOT_DEPLOY.md).

## Koha catalogue and opt-in circulation bridge

Set `KOHA_BASE_URL`, `KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET` on the server to connect a Koha 25.11 bibliographic catalog with OAuth2; open `/koha` from the navigation. The catalogue is read-only by default. Additional Koha holds, checkout/renewal and verified-return workflows exist behind independent feature flags, with live-system qualification still outstanding. See [Koha integration gates](docs/KOHA.md).

## Load audit

The separate [k6 workflow](.github/workflows/load-audit.yml) tests 2,000 synthetic authenticated sessions on a GitHub runner. This is **not** a Render/enterprise/production certification. See [load report protocol](docs/LOAD_AUDIT.md).

## R3 Koha patron-hold pilot (opt-in)

The independent Koha catalogue remains available in read-only mode by default. R3 adds a **feature-flagged, Koha-authoritative hold workflow**, without duplicating Koha hold records in SQLite:

1. Supply `KOHA_BASE_URL`, `KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET`, `KOHA_CIRCULATION_ENABLED=1`, `KOHA_PICKUP_LIBRARY_ID=MAIN` through your secure environment.
2. Librarian: open `/staff`, select a local user and verify its numerical Koha patron ID; exact email match required.
3. Patron: open `/koha`, choose a title and request a hold (only after verified mapping).
4. Patron: use `/koha/me` to see their holds *read directly from Koha*.
5. If the Koha response is uncertain, librarian: `/staff/koha-pending`, inspect the authoritative Koha record and enter its exact hold ID to confirm. LUMEN never blindly retries an ambiguous write.

See [circulation contract and limitations](docs/KOHA_CIRCULATION.md). This is a **controlled integration slice**, not a tested live production Koha deployment. Live Koha checkout and return validation, institutional IdP acceptance, 2,000-production-concurrency, and enterprise certification remain open gates.

## R4 controlled Koha loan pilot

R4 adds Koha-authoritative patron loan listing and renewal, staff checkout issuance, and staff positive reconciliation.
All R4 routes require BOTH KOHA_CIRCULATION_ENABLED=1 AND KOHA_LOANS_ENABLED=1, plus KOHA_PICKUP_LIBRARY_ID.
Without both flags the existing R2/R3 runtime behaviour is unchanged.
Koha is the only source of loan truth; local SQLite stores attempt receipts, not Koha loans.
Koha warnings, blockers and confirmation requirements stop automated issuance: no override tokens are sent.
See [R4 loan contracts, verification and DoD](docs/KOHA_LOANS.md).

DO NOT enable R4 on public production without testing your real Koha instance and operator permissions.
Direct check-in via LUMEN, live institutional IdP acceptance and enterprise scale/recovery certification remain unfinished.

## R5 staff-assisted Koha return verification

R5 adds `/staff/koha-returns` and a positive-evidence check-in verification ticket. A librarian registers the physical return in **Koha staff circulation first**; LUMEN verifies it against Koha's returned-checkout history and records an audit receipt. LUMEN never invents or performs a Koha check-in mutation.

The workflow is disabled by default and requires `KOHA_RETURNS_ENABLED=1` together with the R3/R4 flags. Details, staging acceptance, and failure semantics: [R5 Koha return contracts](docs/KOHA_RETURNS.md).

Check a controlled live Koha fixture without changing library data: `GIT_SHA=$(git rev-parse HEAD) npm run koha:return-smoke`. No live production validation has been executed.

## R6 optional institutional Single Sign-On

R6 adds a feature-flagged OpenID Connect authorization-code login with PKCE. A librarian maps each verified provider subject to an existing account; account roles always come from LUMEN, never provider group claims. No new users or privileges are created automatically. The optional OIDC_ONLY=1 setting disables local-password login after the staff setup has been proven.

See [OIDC.md](docs/OIDC.md) for configuration, staff binding, staging tests and production blockers. Without four required server-side OIDC secrets/URLs, the normal R1–R5 local login remains unchanged.

## Non-negotiable architectural boundaries

- **Standalone mode**: self-contained lightweight single-library circulation, not a full ILS. It does **not** claim MARC cataloguing, federated OPAC, inter-library lending, fines, serials or Koha parity.
- **Koha mode**: future adapter gate, deliberately *not enabled*. Do not write directly to Koha's database or synchronise competing loan authorities without explicit reconciliation.
- **Production SSO**: institutional OIDC adapter is **not implemented**. Local credential accounts are suitable only for controlled pilot usage with appropriate institutional review.
- **Performance**: 2,000 active sessions are a target, not a measured capacity. Test p95 latency, throughput and consistency with realistic data before declaring the gate passed.
- **Web Push**: optional, activated only with VAPID keys; notifications are always persisted in the in-app inbox. Browser permission and subscription are user-controlled.
- **Email**: not part of this version; no claim of delivery is made.

See [release gates and exact scope](docs/RELEASE_GATES.md), [product contracts](docs/CONTRACTS.md), [state-space audit](docs/STATE_SPACE.md), [operations](docs/OPERATIONS.md) and [architecture decisions](docs/DECISIONS.md).

## Deploy & security checklist

TLS (Render provides it), persistent disk, private credential provisioning, secure cookies, backup strategy for SQLite database and WAL, key rotation procedure, access logs without personal data, account offboarding, privacy notices and retention policy. Disaster recovery and external penetration testing are not certified in this repository.

## Technology

Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`), a small optional `web-push` dependency, standards-based PWA (HTML/CSS/ES modules/Service Worker). No client build chain. This is an intentional minimum-dependency choice, not a claim that handwritten integration code is cost-free.

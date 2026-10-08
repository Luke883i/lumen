# LUMEN

LUMEN is a deployable, installable library-services PWA for patrons, faculty and librarians.

## Start in GitHub Codespaces

1. Open this repository in a Codespace (the devcontainer uses Node 24).
2. If the Codespace existed before this commit, run **Codespaces: Rebuild Container** in the VS Code Command Palette (`Ctrl+Shift+P`) to apply the Node 24 devcontainer. A repository update alone cannot install Node into an already-running container.
3. Check `node --version` and `npm --version`; both are checked by the devcontainer bootstrap.
4. Run `npm run dev`. If `npm` is unavailable, run `bash scripts/doctor.sh`; use Rebuild Container (Full Rebuild if necessary).
5. Open forwarded port **3000**. Use the seeded local demonstration accounts:
   - `student@lumen.local` / `Demo1234!`
   - `faculty@lumen.local` / `Demo1234!`
   - `librarian@lumen.local` / `Demo1234!`

Demonstration data is **enabled only** when `LUMEN_DEMO=1` and `NODE_ENV` is not `production`. Never use demonstration credentials on a public service.

## Production on Render

Connect the repo to a Render Blueprint (`render.yaml`). Render provisions a Node service and a **persistent disk** (billable). Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and optionally `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The service uses `/var/data/lumen.sqlite`; never run production on Render's ephemeral filesystem. Seed only one librarian account from `ADMIN_*` on the first start. Add books, copies and patrons from the librarian interface.

`bash scripts/bootstrap.sh` verifies the environment and installs dependencies, `npm run preflight` checks the local release prerequisites, `npm run start` runs the server, `npm test` runs deterministic domain/API tests, `npm run check` checks JS syntax. A health endpoint is available at `/api/health`.

## Koha read-only catalogue bridge

Set `KOHA_BASE_URL`, `KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET` on the server to connect a Koha 25.11 bibliographic catalog with OAuth2; open `/koha` from the navigation. This integration is explicitly **read-only**: Koha holds, renewals and checkouts are not implemented. See [Koha integration gates](docs/KOHA.md).

## Load audit

The separate [k6 workflow](.github/workflows/load-audit.yml) tests 2,000 synthetic authenticated sessions on a GitHub runner. This is **not** a Render/enterprise/production certification. See [load report protocol](docs/LOAD_AUDIT.md).

## R3 Koha patron-hold pilot (opt-in)

The independent Koha catalogue remains available in read-only mode by default. R3 adds a **feature-flagged, Koha-authoritative hold workflow**, without duplicating Koha hold records in SQLite:

1. Supply `KOHA_BASE_URL`, `KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET`, `KOHA_CIRCULATION_ENABLED=1`, `KOHA_PICKUP_LIBRARY_ID=MAIN` through your secure environment.
2. Librarian: open `/staff`, select a local user and verify its numerical Koha patron ID; exact email match required.
3. Patron: open `/koha`, choose a title and request a hold (only after verified mapping).
4. Patron: use `/koha/me` to see their holds *read directly from Koha*.
5. If the Koha response is uncertain, librarian: `/staff/koha-pending`, inspect the authoritative Koha record and enter its exact hold ID to confirm. LUMEN never blindly retries an ambiguous write.

See [circulation contract and limitations](docs/KOHA_CIRCULATION.md). This is a **controlled integration slice**, not a tested live production Koha deployment. Koha checkout/check-in/renew, institutional SSO, 2,000-production-concurrency, and enterprise certification remain open gates.

## R4 controlled Koha loan pilot

R4 adds Koha-authoritative patron loan listing and renewal, staff checkout issuance, and staff positive reconciliation.
All R4 routes require BOTH KOHA_CIRCULATION_ENABLED=1 AND KOHA_LOANS_ENABLED=1, plus KOHA_PICKUP_LIBRARY_ID.
Without both flags the existing R2/R3 runtime behaviour is unchanged.
Koha is the only source of loan truth; local SQLite stores attempt receipts, not Koha loans.
Koha warnings, blockers and confirmation requirements stop automated issuance: no override tokens are sent.
See [R4 loan contracts](docs/KOHA_LOANS.md).

DO NOT enable R4 on public production without testing your real Koha instance and operator permissions.
Returns/check-ins, institutional SSO and enterprise scale/recovery certification remain unfinished.

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

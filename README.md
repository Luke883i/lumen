# LUMEN

LUMEN is a deployable, installable library-services PWA for patrons, faculty and librarians.

## Start in GitHub Codespaces

1. Open this repository in a Codespace (the devcontainer uses Node 24).
2. In the terminal run `npm install && npm run dev`.
3. Open forwarded port **3000**. Use the seeded local demonstration accounts:
   - `student@lumen.local` / `Demo1234!`
   - `faculty@lumen.local` / `Demo1234!`
   - `librarian@lumen.local` / `Demo1234!`

Demonstration data is **enabled only** when `LUMEN_DEMO=1` and `NODE_ENV` is not `production`. Never use demonstration credentials on a public service.

## Production on Render

Connect the repo to a Render Blueprint (`render.yaml`). Render provisions a Node service and a **persistent disk** (billable). Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and optionally `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The service uses `/var/data/lumen.sqlite`; never run production on Render's ephemeral filesystem. Seed only one librarian account from `ADMIN_*` on the first start. Add books, copies and patrons from the librarian interface.

`npm run start` runs the server, `npm test` runs deterministic domain/API tests, `npm run check` checks JS syntax. A health endpoint is available at `/api/health`.

## Non-negotiable architectural boundaries

- **Standalone mode**: self-contained lightweight single-library circulation, not a full ILS. It does **not** claim MARC cataloguing, federated OPAC, inter-library lending, fines, serials or Koha parity.
- **Koha mode**: future adapter gate, deliberately *not enabled*. Do not write directly to Koha's database or synchronise competing loan authorities without explicit reconciliation.
- **Production SSO**: institutional OIDC adapter is **not implemented**. Local credential accounts are suitable only for controlled pilot usage with appropriate institutional review.
- **Performance**: 2,000 active sessions are a target, not a measured capacity. Test p95 latency, throughput and consistency with realistic data before declaring the gate passed.
- **Web Push**: optional, activated only with VAPID keys; notifications are always persisted in the in-app inbox. Browser permission and subscription are user-controlled.
- **Email**: not part of this version; no claim of delivery is made.

See [product contracts](docs/CONTRACTS.md), [state-space audit](docs/STATE_SPACE.md), [operations](docs/OPERATIONS.md) and [architecture decisions](docs/DECISIONS.md).

## Deploy & security checklist

TLS (Render provides it), persistent disk, private credential provisioning, secure cookies, backup strategy for SQLite database and WAL, key rotation procedure, access logs without personal data, account offboarding, privacy notices and retention policy. Disaster recovery and external penetration testing are not certified in this repository.

## Technology

Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`), a small optional `web-push` dependency, standards-based PWA (HTML/CSS/ES modules/Service Worker). No client build chain. This is an intentional minimum-dependency choice, not a claim that handwritten integration code is cost-free.

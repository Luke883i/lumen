# R3 / Koha circulation K3 — Patron mapping and authoritative holds

**Goal:** permit an explicitly enrolled patron to place a hold with **Koha as the sole source of truth**. Standalone loans, books and holds remain a separate namespace. There is no cross-write, automatic migration or fallback.

## Enable in a controlled test installation

Configure `KOHA_BASE_URL`, `KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET`, then:

```bash
export KOHA_CIRCULATION_ENABLED=1
export KOHA_PICKUP_LIBRARY_ID=MAIN
npm run dev
```

The Koha API service account must have scoped `borrowers`, `reserveforothers` privileges appropriate to `GET /holds`, `GET /patrons/{patron_id}` and `POST /holds`. Verify against your exact Koha release. Operator must verify library code and patron emails beforehand.

1. Staff `POST /api/staff/koha/bind` with `{userId, patronId}`; Koha patron email must match the active LUMEN account exactly. This is a manual identity binding, **not institutional SSO**.
2. `GET /api/integrations/koha/my/binding` confirms own mapping.
3. `GET /api/integrations/koha/my/holds` retrieves own Koha holds (no user-supplied patronId).
4. `POST /api/integrations/koha/my/holds` accepts `{biblioId}`, requires normal LUMEN session, CSRF header and `Idempotency-Key`.
5. Staff `GET /api/staff/koha/pending` lists ambiguous attempted operations for manual reconciliation.

## Commit/timeout semantics

LUMEN records a `reserved` attempt **before** issuing a Koha write. Successful 201 with matching IDs yields `succeeded` and a durable JSON receipt plus an audit event. Known Koha policy refusals are `rejected`; timeouts, HTTP 5xx, malformed positive responses and process termination are **uncertain**. A repeated request with the same key returns the prior receipt if confirmed; otherwise requires reconciliation. Different keys for the same patron/title cannot bypass unresolved operations.

**Caveat:** Koha REST API does not promise the same idempotency semantics as LUMEN; any loss after Koha commit and before local receipt demands explicit reconciliation. This slice intentionally does **not** offer blind retry or an automatic replay button.

## Exit criteria still blocked

- K2: real Koha 25.11 environment with permissions, patron fixtures and server responses validated.
- K4: Koha checkout/check-in/renewal lifecycle; tested library policies and errors.
- K5: OIDC, high-availability, security review, disaster recovery and production-equivalent 2,000 user soak.

API contracts: https://api.koha-community.org/25.11.html . No full enterprise certification is implied by mock tests.

## Staff reconciliation (implemented)

The librarian's `/staff/koha-pending` screen accepts an actual Koha hold ID. `POST /api/staff/koha/reconcile` fetches `GET /api/v1/holds/{hold_id}`, validates the active hold's patron and title against the stored pending attempt, and atomically records an audited receipt. Only positive reconciliation is supported; ambiguous operations with no verified hold remain blocked. This is deliberately fail-closed.

## Run live, safe verification (not performed automatically)

Configure **secrets** `KOHA_BASE_URL`, `KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET` along with a known Koha test fixture: `KOHA_TEST_PATRON_ID`, `KOHA_TEST_PATRON_EMAIL` and optionally `KOHA_TEST_BIBLIO_ID`, then run `GIT_SHA=$(git rev-parse HEAD) npm run koha:smoke`. The command uses only GET endpoints and OAuth2 token grant, never places or cancels a hold. It exits nonzero on a failed check **or when the patron fixture is missing**, binding an evidence report to the SHA. Passing this cannot prove live write compatibility, cross-system identity lifecycle or enterprise readiness.

## R4 loan extension

See [KOHA_LOANS.md](KOHA_LOANS.md). The loans interface, issuance and renewal are behind a second feature flag. Koha returns/checkins remain outside this slice.

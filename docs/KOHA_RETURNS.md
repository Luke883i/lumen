# R5 — Verified Koha returns (staff-assisted)

## What this slice actually does

R5 does NOT call a Koha check-in mutation API. The approved flow is:

1. Librarian confirms physical possession of the item and identifies its Koha checkout ID.
2. LUMEN staff screen `/staff/koha-returns` creates a locally auditable **verification ticket**, only after Koha reports a matching active checkout.
3. Librarian completes check-in using the authoritative Koha staff circulation workflow.
4. Librarian clicks **Verify** in LUMEN. The backend requests Koha's checked-in checkout history, with `checked_in=true`, and requires positive evidence matching **checkout ID, patron ID, item ID and check-in timestamp**.
5. LUMEN records one atomic audit receipt with the verified Koha return date and branch. The remote Koha circulation engine alone determines copy availability and queue advancement.

An absent active checkout, HTTP 404, empty checkout history, malformed or mismatched record, inaccessible Koha API, or missing date is **not proof** of a completed return. The ticket remains awaiting Koha. Repeated successful verification replays the same receipt; it does not generate another audit event.

## Feature flags (OFF by default)

Set all three only in a controlled staging environment:

```bash
KOHA_CIRCULATION_ENABLED=1
KOHA_LOANS_ENABLED=1
KOHA_RETURNS_ENABLED=1
```

Koha base URL, OAuth2 client ID/secret and pickup library code must be configured as for R3/R4. LUMEN's standalone loans and local holds remain separate; R5 does not mutate them.

## Endpoints and roles

- `POST /api/staff/koha/returns/prepare` JSON `{checkoutId}` + authenticated librarian + CSRF + Idempotency-Key (12–100 safe characters).
- `GET /api/staff/koha/returns` lists pending verification tickets (librarian only).
- `POST /api/staff/koha/returns/verify` JSON `{ticketId}` + authenticated librarian + CSRF.

## Local state matrix

| State | Meaning | Allowed transition |
|---|---|---|
| Absent | No local verification ticket | Prepare when Koha shows active checkout |
| awaiting_koha | Operator must first perform check-in in Koha | Verify only when exact historical record exists |
| verified | Positive Koha evidence captured | Idempotent read/replay only |

No local `returned` loan state exists for a Koha checkout. Only evidence and audit metadata persist. A unique partial index prevents two simultaneous open return tickets for the same checkout.

## Non-mutating live evidence gate

Use a disposable known-returned Koha test checkout and configure environment secrets:

```bash
export KOHA_TEST_PATRON_ID=101
export KOHA_TEST_CHECKOUT_ID=501
export KOHA_TEST_ITEM_ID=81
GIT_SHA=$(git rev-parse HEAD) npm run koha:return-smoke
```

The IDs above are placeholders. The script makes read-only Koha queries (aside from the OAuth token grant). A PASS proves the specific historical contract for a given fixture and SHA, **not** that Koha accepts a return mutation from LUMEN.

## Enterprise promotion blockers

- No verified official Koha REST check-in mutation contract in 25.11; use Koha staff interface, or formally qualify a supported integration such as SIP2 if deployment requires remote check-in.
- No live Koha 25.11 credentials/test fixture were available for this PR; the real connector smoke must be executed and archived.
- Institutional OIDC, horizontal/HA design, offsite backup and timed restore, 2,000-user mixed Koha/Render soak, external security/privacy/accessibility checks remain open.
- Koha holds and queue progression are read from Koha, not reimplemented in LUMEN.

API source: https://api.koha-community.org/25.11.html

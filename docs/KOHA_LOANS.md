# R4 Koha loan circulation contracts

Koha 25.11 REST API reference: https://api.koha-community.org/25.11.html

## Implemented API vertical slices (local mock-contract tested)

- GET /api/v1/checkouts?patron_id=: owner-scoped current loans with full-list bounded check.
- GET /api/v1/checkouts/{id}: remote loan owner and state verification.
- GET /api/v1/checkouts/{id}/allows_renewal: authoritative Koha renewal policy.
- POST /api/v1/checkouts/{id}/renewals: renewal; never send policy overrides.
- GET /api/v1/checkouts/availability: patron/item checkout preflight.
- POST /api/v1/checkouts: librarian issues physical item with patron_id, item_id and library_id.

## LUMEN API / feature flags

Set KOHA_CIRCULATION_ENABLED=1, KOHA_LOANS_ENABLED=1, KOHA_PICKUP_LIBRARY_ID=MAIN and standard Koha OAuth2 environment secrets. The extra flag defaults to disabled.

- GET /api/integrations/koha/my/loans — own loans, server-resolved patron ID.
- POST /api/integrations/koha/my/renew — JSON {checkoutId}, CSRF and Idempotency-Key.
- POST /api/staff/koha/checkout — JSON {userId,itemId}, librarian role required.
- GET /api/staff/koha/loans-pending — unresolved Koha writes.
- POST /api/staff/koha/loans-reconcile — JSON {attemptId,checkoutId}, positive remote validation.

## Transactional invariants

An attempt is reserved in SQLite before a remote POST. Receipt successful -> durable audit; timeout/5xx or malformed response -> uncertain. No retry of uncertain writes, including different keys for the same checkout or item. Koha confirms business rules; no client can supply an arbitrary patron ID. Staff reconciliation verifies Koha patron/item/renewal counters. Operator must validate physical issuance and real Koha access rights.

## Open gates

Actual Koha checkout/renew against test patron and item: UNVERIFIED (no live secrets).
Check-in/return: NOT IMPLEMENTED, pending verified Koha API and policy contract.
Enterprise OIDC: UNVERIFIED. Render target 2,000 concurrent mixed load soak: UNVERIFIED.
High availability and offsite recovery: UNVERIFIED. Privacy/security/accessibility audit: UNVERIFIED.

No enterprise production readiness claim is supported by green mock CI alone.

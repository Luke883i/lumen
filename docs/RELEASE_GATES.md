# LUMEN release gates — authoritative R2 status

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

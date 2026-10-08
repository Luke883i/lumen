# LUMEN product contracts, v1

## Global DoD
G1: app boots from fresh checkout with documented commands; health endpoint responds.
G2: each HTTP mutation enforces authenticated role, CSRF and input validation.
G3: every committed circulation transition preserves copy exclusivity and FIFO holds.
G4: a write is acknowledged only after successful database commit.
G5: all visible status derives from the server; no optimistic success for loan/hold/acquisition.
G6: PWA is installable where supported and never caches authenticated API responses.
G7: no default demonstration account exists in production.
G8: deploy blueprint binds durable storage and validates first-start admin configuration.
G9: tests and source-check are executable; 2,000-user benchmark not claimed without run data.

## Intermediate DoD
Identity: librarian-provisioned student/faculty users; login/logout/session expiry; no self-elevation.
Discovery: title/author/ISBN/subject search, deterministic sort and available count.
Circulation: request/cancel hold; allocate ready holds; librarian issue and receive books; patron renewal subject to policy.
Acquisitions: faculty submits, librarian approves/rejects/marks obtained.
Communications: inbox persists per user, librarian category broadcast, read status; push only with consent and VAPID.
Operations: status endpoint, log without secrets, recovery documented and disk persistent.

## Local DoD
- search GET: safe bounded query and 0..N matching catalog records; no patron data exposure.
- hold POST: reject duplicates, assign READY only when eligible free copy exists; write notification once.
- issue POST: staff only, correct user/copy, atomic loan and READY fulfillment.
- return POST: staff only, exactly one open loan transitions to returned and oldest queued hold becomes READY.
- renew POST: owner/staff, renew count below maximum, no waiting holds.
- suggestions POST: faculty only; bibliographic metadata and reason validated.
- broadcast POST: staff only, bounded message, user/role matching and persisted delivery.
- session mutation: same-origin JSON, valid CSRF token, role check.
- database: foreign keys, WAL, unique partial indexes and transaction rollback.

## Gate taxonomy
SUPPORTED = behavior exercised in local tests.
DESIGNED = implementation exists without passing runtime test.
UNVERIFIED = external dependency or production environment not exercised.
BLOCKED = cannot claim until missing gate passes.

Production-ready, 2,000 concurrent, Koha-integrated, institutional SSO, email-delivery and proof-grade are currently **UNVERIFIED / BLOCKED**.

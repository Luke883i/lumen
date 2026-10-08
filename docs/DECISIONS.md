# Architecture decision record

## ADR-001: Reject immediate Koha-only deployment
**Falsification:** Koha includes rich circulation/acquisition capability but cannot be used without configuring and operating an ILS. A Koha-dependent blank frontend is not a usable-from-zero runtime.

**Decision:** standalone local circulation with an explicit future Koha adapter seam. Do **not** claim ILS equivalence or promise automatic migration. When Koha is introduced, replace the authoritative circulation service rather than duplicate loan mutations.

## ADR-002: One Node process, SQLite WAL, persistent disk
Single-library pilot needs an operationally small footprint; Node synchronous SQLite serialises in-process writes within transactions. A single instance and persistent disk are required. Horizontal scale and 2,000-concurrent-user capacity are **not proven**. Promotion to PostgreSQL is a separate measured architectural change.

## ADR-003: Progressive web app without frontend framework
Native HTML/CSS/ES modules reduce build artifacts, cold start and dependency surface. The UI uses a small reusable design system and shared HTML helpers, not handwritten copies of each page.

## ADR-004: Safety and identity
Passwords use scrypt and unique salts; authenticated operations require opaque HttpOnly session cookies and CSRF headers. Controlled-pilot identity only; institution-wide SSO, rate limits across multiple instances and advanced security controls remain gating requirements.

## ADR-005: State ownership
Books, copies, holds, loans, suggestions and user profiles are authoritative in standalone SQLite. Inbox records and push subscriptions share the same database. No stale client cache is allowed to confirm a write.

## ADR-006: Scope
The system supports three profiles, book search, suggestions, reservations, renewals, checkout/return, catalog and member provisioning, inbox, category broadcasting, PWA installation and optionally push. Data import, MARC, inter-library loan, fines, OIDC, full WCAG certification and external integration remain not implemented.

## Evidence
GitHub repo sources reviewed: Koha-Community/Koha, folio-org/mod-circulation, evergreen-library-system/Evergreen, slims/slims9_bulian, inveniosoftware/invenio-app-ils. Design selection is not an executed vendor benchmark.

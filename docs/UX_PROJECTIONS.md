# UX-S2 — LUMEN projections: presentation without delegated authority

**Architecture:** `public/projections.js` imports only the UX-S1 terminology from `public/experience.js`. It contains no network calls, database writes, DOM mutation, persistent storage, or role grants. A view model is frozen and returns `{domain, provenance, label, helper, status, epistemicStatus, action}`. The `action` field is a conditional *presentation affordance*; permission, circulation policy and actual results remain decided by the backend.

## Contract matrix

| Projection | Authority/provenance | Supported conclusion | Falsifying input / expected behavior |
|---|---|---|---|
| `projectLocalBook` | `lumen.standalone.catalog` | Exact local count only when supplied as nonnegative integer | null, -1, string or missing ID never becomes a confirmed copy or enabled action |
| `projectKohaBook` | `koha.bibliographic` | Catalogued title/item metadata; **not loan availability** | 1, 20 or 1,000 recorded copies all remain availability unknown |
| `projectLocalHold` | `lumen.standalone.holds` | Queued/ready/fulfilled/cancelled only from API status | Unknown status cannot enable cancellation or imply pickup |
| `projectLocalLoan` | `lumen.standalone.loans` | In loan/returned; a renewal may be requested conditionally | renewal_count unknown, >0, queue unknown: no promise that the renewal is allowed |
| `projectAcquisition` | `lumen.standalone.acquisitions` | pending/approved/rejected/ordered | ordered is **never** the same as acquired/delivered |
| `projectNotification` | `lumen.inbox` | Read/unread in app | `push_status=sent` never proves OS delivery |
| `projectPatron` | `lumen.session` | Current UI affordances from authenticated role | Unrecognized role/no user ID: only catalogue search, no privileged actions |
| `projectKohaOperation` | `koha.receipt` | Verified only if both documented terminal status and backend proof validation are supplied | timeout/pending/rejected/failed not upgraded to success; no automatic retry |

## State algebra and trust boundary

All cases use the finite UX epistemic vocabulary `supported | conditional | unknown | blocked`. This is a display annotation, not a trust assertion about an external institution. Source-scoped projections cannot convert a bibliographic record into loan availability or fabricate authorization. Status and helper are escaped by the existing `t()` UI sanitizer. Unknown cases show a next step without speculating about success.

The browser may conditionally expose an action. It **cannot** grant it: LUMEN still checks active sessions, roles, ownership, queue limits and Koha reconciliation server-side. No new endpoint, table or configuration flag has been introduced.

The Koha read projection is intentionally conservative; a future complete Koha availability adapter would require a new authoritative source contract and tests, not an altered copy-count heuristic. Likewise, the `proofVerified` flag in `projectKohaOperation` must come from a verified backend receipt, never from a browser-controlled raw status field. Current pending screens pass no such flag and always show nonterminal states.

## Definition of Done

- **Local:** immutable pure results, no I/O, all eight domain projections, unknown and denial branches, source-aware mutation tests. No additional production dependency.
- **Intermediate:** actual catalog, book detail, loans, holds, acquisitions, notifications, patron role nav and Koha catalogue/uncertain operations use the selectors; offline SW caches the module. Existing API and role boundaries unchanged.
- **Global:** tests and syntax checks, browser desktop+Android emulation, `npm run verify:boot`, `npm run verify:deploy` green at the final PR commit.
- **External:** physical Chrome OS installation/notifications, live Render persistence/restore, institutional Koha+OIDC conformance, HA/security/accessibility and 2,000 concurrent workload remain independently BLOCKED.

## Next cuts

**UX-S3** information architecture and progressive disclosure after S2; **UX-S4** measurable density and visual compression; **UX-S5** clarity/focus of CTAs and errors; **UX-S6** final composition, pairwise state audit and evidence. In parallel: real Render R10, institutional Koha/IdP R11, physical push/PWA R9c; R12 performance, R13 enterprise release.

### Koha route canonicalization

Koha adapter represents a bibliographic identifier as `koha:<positive integer>`; its UI route uses only the validated numeric identifier. A malformed source-scoped ID cannot enable or synthesize a Koha action. These routes remain presentation links, not remote mutation authority.

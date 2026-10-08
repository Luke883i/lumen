# UX-S3: Task-led information architecture

**Baseline:** UX-S1 and UX-S2 merged. UX-S3 only changes presentation and read selection. Server-side RBAC, loan authority, Koha receipt semantics and database schema are unchanged.

## User intent → shortest progressive journey

| Role | Primary destinations | Next task |
|---|---|---|
| Guest | Home, Catalogo | Search, then sign in to reserve |
| Student | Home, Catalogo, La mia area, Avvisi | Find title → request hold → track status |
| Faculty | Student destinations + Proposte | Submit/track teaching acquisitions |
| Librarian | Student destinations + Banco | Choose operation → verify receipt/next action |

Every role has at most FIVE mobile primary destinations; Koha and preferences live in secondary services. Local and Koha copies, loans and hold receipts are NEVER merged into a fictitious combined state.

## Librarian deep-link matrix

| URL | User task | Requested backend data |
|---|---|---|
| /staff | Overview and task selector | staff stats |
| /staff?area=circolazione | Issue/return, active loans, ready holds | staff stats, users, books |
| /staff?area=catalogo | Register local title and copies | none until submit |
| /staff?area=acquisti | Review suggestions | suggestions |
| /staff?area=persone | Provision/disable accounts | users |
| /staff?area=comunicazioni | Broadcast to inbox | none until submit |
| /staff?area=integrazioni | Optional Koha and OIDC binding/verification | users only when configured |

Selected-workspace presentation must not be conflated with authorization; every staff API enforces backend RBAC. Unknown area values fall back to overview, not administrative settings. All workspaces use stable URLs and navigation landmarks, not fragile JavaScript-only accordion states.

## Definition of Done

- LOCAL: pure navigation/area selectors, unique primary routes ≤5, invalid URL fallback, Koha feature-gated secondary links, nested active-route indicators; unit tests verify all roles and capability mutations.
- INTERMEDIATE: home shows immediate task links, desktop/mobile use same route model, native links with aria-current, per-area librarian forms and results, direct-link survival on reload, no unrelated staff GETs. Chromium desktop and Android emulation tests verify navigation and no horizontal body overflow.
- GLOBAL: no new UI dependency, no new backend authority, Node 24 Codespaces still starts with npm run dev, Render uses npm start, PWA worker caches the navigation module, exact SHA CI + browser regression required.
- EXTERNAL BLOCKERS: real Chrome Android/Windows, OS push, live Render state/restore, Koha/IdP, 2k concurrent production-equivalent users, HA/DR, privacy/security and WCAG human audit.

## Next semantic cuts

UX-S4 = measurable visual density/size budgets without shrinking touch targets. UX-S5 = CTA/recovery/keyboard focus and WCAG 2.2 AA review. UX-S6 = cross-role composition/evidence review. In parallel R10 (Render live + backup restore), R11 (Koha/IdP staging), R9c (physical PWA/push); finally R12 capacity/security/HA and R13 institutional release gate.

Accessibility: workspaces are navigation LINKS (nav + aria-current), not ARIA tab widgets; there is no hidden JavaScript tab state to synchronize.

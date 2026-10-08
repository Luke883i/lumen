# LUMEN — residual semantic and UX lattice (2026-10-08)

Canonical baseline: UX-S1 and UX-S2 merged; UX-S3 implemented in PR #13 from main c5c9374c1eb5243f7fc01078ddf482d974e607c3. This document **does not assert** live Render/Koha/IdP/device/2,000-concurrent certification.

## Product intent: minimum code, maximum understandable action

An end user should answer these four questions without interpreting systems architecture:
1. **Where am I?** Catalogue / My loans / Acquisition proposals / Library desk.
2. **What can I do next?** Exactly one visually primary action for a given decision.
3. **What happened?** A source-backed status, not a generic toast.
4. **What if it did not complete?** An unambiguous follow-up, without falsely inferring remote outcomes.

Preserve the three profiles, PWA and notification inbox. Reduce cognitive and visual surface without reimplementing Koha, role authorization, or a new design framework.

## 1 — Partial order (DAG, not a long waterfall)

```text
MERGED baseline (R1–R9b)
          |
     UX-S1 semantic truth / domain glossary / copy policy      [merged]
          |
     UX-S2 non-authoritative projection and action contracts    [merged]
          |
     UX-S3 role/task IA and progressive-disclosure recomposition [PR #13]
          |
     UX-S4 visual compression and responsive density budgets
          |
     UX-S5 end-to-end CTA, accessibility and interaction clarity
          |
     UX-S6 composition audit: browser traces, mutation tests, review
          | 
          +----------------------+----------------------+
         R10 Render live       R11 real Koha/IdP       R9c physical PWA/push
          \______________________|______________________/
                                 |
                    R12 target capacity / security / HA
                                 |
                    R13 evidence-bound enterprise decision
```

The three environment acceptance workstreams are **parallel to UX-S1...S6**, not blocked by cosmetic changes. UX-S2 and UX-S3 may overlap on separate routes only after shared terms/actions are frozen. UX-S4 is deliberately **after** route-level business semantics: do not compress misleading text or hide unresolved operational states.

## 2 — Semantic contracts and provenance

Data source / authority is a **backend contract**, not something a frontend badge creates:

| Domain | Canonical authority | Read-model content | Allowed UI conclusion |
|---|---|---|---|
| Standalone catalogue and copies | LUMEN standalone SQLite | title, author, ISBN, local available count | 'X copie disponibili nel catalogo LUMEN' only when confirmed by local endpoint |
| Koha bibliographic catalogue | Koha API | biblio metadata, recorded item count | 'Da verificare su Koha' unless Koha provides an authoritative availability answer |
| Local hold | LUMEN local hold state | queued / ready / fulfilled / cancelled | 'In coda', 'Pronto al ritiro', etc., exclusively from receipt |
| Koha hold, checkout, renewal | Koha through integration, receipts | verified/pending/uncertain | label pending or require reconciliation; never replace uncertainty with success |
| Local acquisition proposal | LUMEN proposal review workflow | submitted / approved / rejected / ordered | 'Proposta inviata' or exact approved/rejected/ordered status; never 'Libro acquistato' solely from ordered |
| System push | Browser+OS transport | registered/denied/subscribed | 'Notifiche su questo dispositivo' only after server ownership check; delivery is best-effort |
| User/role | LUMEN session and server RBAC; optional verified IdP binding | current user role | display functions matching role, without inferring permissions from UI state |

For a projection `P`, use only `P(data, source, featureFlags, role)` to produce `{label, CTA, helper, provenance, epistemicStatus}`. A projection **may not** write to databases, invent remote availability, elevate roles, infer successful mutations from timeouts, or claim production-grade Koha/PWA/enterprise proof. Server-side authorization and transitions are authoritative. Fail-closed states are `supported | conditional | unknown | blocked`.

**Cataloging standard mapping:** use title/author/ISBN vocabulary compatible with MARC 21 bibliographic fields and respect bibliographic title versus physical copy. Do **not** claim an entire IFLA LRM (Work–Expression–Manifestation–Item) implementation; it is a conceptual guide for labels, not an implemented catalog model.

## 3 — Exact semantic-slice DoD

**UX-S1 — Business language & receipts (first PR)**
- Inventory every route, heading, description, placeholder, status, CTA and toast; define canonical Italian glossary and forbidden overclaims.
- Replace misleading reservation copy, 0-copy wording and generic hold success with exact receipt-dependent state; preserve route names, API contracts and baseline Playwright expectations unless deliberately updated.
- Domain state permutations (zero, one, many, unknown; queued vs ready) tested as pure functions; no source inference without evidence.

**UX-S2 — Non-authoritative, progressive projections**
- Extract only read-only selectors for book, hold, loan, acquisition, notification, patron and Koha proof-state; every view-model has source and capability fields.
- Unknown/unconfigured/pending/rejected/error distinctions survive to UI; no outbound call in projection; direct navigation to deeper authoritative screens remains available.
- Tests mutate source, role and feature flags; a projection does not create eligibility or change backend state.

**UX-S3 — IA / recomposition**
- One direct path per primary task; shared top-level sections **Cerca | La mia area | Richieste | Banco (staff) | Avvisi** with role-conditioned variations.
- Home surfaces search first, then one task-oriented service summary; staff desk progressively separates issue/return/verify, users, communication and configuration.
- At most five mobile primary nav destinations, secondary routes grouped; show current section and a predictable back route; never hide urgent or unresolved states.

**UX-S4 — Visual compression**
- Numeric *design budgets* to enforce via Playwright measurements (not WCAG thresholds): main home hero ≤240 CSS px desktop / ≤180 px mobile at 100% font scale on target viewports; book cover decorative placeholder ≤64×88 CSS px; metric tiles ≤112 px; one primary CTA per decision group; 8/12/16 px local rhythm; remove ornamental oversized graphics.
- Respect user text zoom 200%, minimum test viewport 320 CSS px, reflow and focus visibility. Do NOT compress tap targets: LUMEN preference ≥44×44 CSS px; WCAG 2.2 AA SC 2.5.8 requires ≥24×24 CSS px or qualifying spacing/exceptions.
- Repeated CSS inline overrides migrated to shared tokens; no React/Tailwind or new icon library.

**UX-S5 — CTA & interaction clarity**
- Inventory all server mutations; exact verb-object label + success/pending/blocked/failure text and next action. Never use 'Operazione registrata' for stateful domain outcomes.
- Destructive or non-idempotent actions use appropriate native confirmation and focus; long-running/uncertain external operations never auto-retry; disabled/allowed states explained.
- Keyboard Tab/Enter/Escape, focus return, accessible input labels and live status announcements measured.

**UX-S6 — Final composition and epistemic audit**
- Capture deterministic screenshots / accessibility tests in desktop Chromium + Android emulation, compare semantic headings/controls and visual bounding-box budgets across roles.
- Perform role×source×capability×network×operation **reachable state** coverage and pairwise tests; avoid claiming exhaustive Cartesian execution.
- Produce SHA-bound evidence artifacts (PASS/FAIL/BLOCKED) and an explicit operator real-device matrix.

## 4 — Standard adoption levels

| Standard / convention | Role | Acceptance |
|---|---|---|
| WCAG 2.2 Level AA | normative target for accessible web content | measurable keyboard/focus/contrast/reflow/target criteria; manual AT audit remains |
| WAI-ARIA APG modal-dialog pattern | behavior guide | native dialog, keyboard containment, Escape, return-focus |
| HTML Living Standard + semantic forms | implementation | labels, landmarks, headings, native validation and real buttons |
| DTCG Design Tokens Format Module 2025.10 | interoperable design-token structure (Community Group report, **not W3C Recommendation**) | adopt tokens only if export/tool interoperability needed; CSS custom properties remain source for pilot |
| IFLA Library Reference Model; MARC 21 bibliographic | bibliographic semantic reference | title, creator, identifier, manifestation/copy distinction where supported by Koha; no fake completeness |
| PWA Web App Manifest + service worker; Push/Notifications APIs | browser integration | device-dependent install/push states; real Chrome OS validation separate |
| Conventional Commits + CI branch protection + ADRs | engineering governance | semantic commits; each PR has rollback risk, CI gate and evidence links |

## 5 — Global release cuts

- **Codespaces-ready**: fresh Node 24 devcontainer + `npm run dev`, private port 3000, tested three roles and catalog.
- **Render pilot**: production `npm start`, preflight, persistent single-instance SQLite, real SHA-bound canary, persisted restart, offsite backup and timed restore (R10 external gate open).
- **Institutional integration**: live Koha test fixtures and verified IdP roles, no double authority (R11 open).
- **Enterprise ILS**: 2,000 concurrent **realistic mixed authenticated** users with tail latency, saturation/fault tests, scaling/DR decisions; security/privacy/WCAG signoff and evidence register (R12/R13 open).

No PR count, screenshot quality, or green mock CI alone qualifies LUMEN as enterprise ILS.

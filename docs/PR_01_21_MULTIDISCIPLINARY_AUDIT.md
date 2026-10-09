# LUMEN — Audit unitario e reticolare delle PR #1–#21

**As-of:** 9 October 2026. **Verified baseline:** all 21 PRs merged; `main` SHA `4ec82fada4060a1bb5525cd18180e7b0782df4ec`. Main checks CI, R9 Browser Acceptance, BIME Security Assessment and UX Semantic Million Gate passed at that SHA. **Method:** GitHub PR metadata + all 21 *changed-file lists*, repository source/test/runbooks and explicit residual release gates. This is an architecture/traceability audit, **not** a complete diff-by-diff, penetration, legal or institution-operated certification.

## A. 21 individual semantic controls

Status `SRC` means source/tests exist at merge; `EXT` means evidence requires a real external runtime. A green PR does not prove EXT.

| PR | What was implemented (source-level) | Independent falsification/debt | Ownership |
|---|---|---|---|
| [1](https://github.com/Luke883i/lumen/pull/1) | Node/SQLite three-role circulation, PWA, API, UI | Local holds/loans prove no Koha integration | domain |
| [2](https://github.com/Luke883i/lumen/pull/2) | Codespaces repair, Koha read interface, backup, synthetic k6 | 2,000 VUs on CI hardware are not target capacity | runtime |
| [3](https://github.com/Luke883i/lumen/pull/3) | Koha patron ID+hold mapping and uncertainty receipts | Real Koha 25.11 policy/data fixture not tested | Koha |
| [4](https://github.com/Luke883i/lumen/pull/4) | Koha checkout/renew policy + idempotency receipts | Network ambiguity/fail-closed; real instance unverified | Koha |
| [5](https://github.com/Luke883i/lumen/pull/5) | Check-in historical evidence and staff handoff | Actual check-in remains in Koha staff interface | Koha |
| [6](https://github.com/Luke883i/lumen/pull/6) | Institutional OIDC PKCE subject/role binding | Real IdP claims, outage and deprovisioning open | identity |
| [7](https://github.com/Luke883i/lumen/pull/7) | One-command Codespaces, Render Blueprint, SHA canary | Live Render persistence, backup/restore open | operations |
| [8](https://github.com/Luke883i/lumen/pull/8) | Design, PWA install, consent/push UI | Physical Android/Windows Chrome not executed | UX |
| [9](https://github.com/Luke883i/lumen/pull/9) | Playwright real browser desktop + emulated Android | Browser emulation not OS-install proof | UX QA |
| [10](https://github.com/Luke883i/lumen/pull/10) | Push ownership, revocation, key/worker checks | Provider accepted does not mean received/displayed | privacy |
| [11](https://github.com/Luke883i/lumen/pull/11) | Catalog/hold availability and receipt semantics | Local source labels not cross-authoritative for Koha | domain UX |
| [12](https://github.com/Luke883i/lumen/pull/12) | Pure, source-scoped projections | Projection never grants backend authorization | UI truth |
| [13](https://github.com/Luke883i/lumen/pull/13) | Role/task navigation and staff workspaces | Task success needs observed end-user validation | IA |
| [14](https://github.com/Luke883i/lumen/pull/14) | Holds/proposals staff inbox and push wiring | Inbox event != Chrome OS toast | service |
| [15](https://github.com/Luke883i/lumen/pull/15) | Measured responsive density budgets | Pixel-height tests != WCAG conformance | design |
| [16](https://github.com/Luke883i/lumen/pull/16) | Safe CTA pending/uncertain states and render races | Live remote write reconciliation still open | interactions |
| [17](https://github.com/Luke883i/lumen/pull/17) | Unified blue PWA CSS, icon/manifest | Icon rights and visual accessibility signoff open | identity |
| [18](https://github.com/Luke883i/lumen/pull/18) | Session/Origin security boundary; deterministic mutations | 1m vectors != independent attack simulation | security |
| [19](https://github.com/Luke883i/lumen/pull/19) | MIT proposal, dependency notices, OSS trace | Rights-holder/relicensing verification open | legal OSS |
| [20](https://github.com/Luke883i/lumen/pull/20) | Browser screenshots and operator policy hub | Institutional privacy/contact/terms must be supplied | governance |
| [21](https://github.com/Luke883i/lumen/pull/21) | Task projections, verified empty states, 1m UX mutations | Structural assertions != observational user research | UX QA |

**Corrections to the historical record:** references to hypothetical PR #22–#26 in the UX convergence source were **internal cut labels**, not actual GitHub PRs. The next real PR will be a single R10 operational slice with independent commits; do not retroactively treat those labels as merged PRs.

## B. Reticular intersections and vulnerability hypotheses

| Intersection | PR graph | Operational invariant | Confidence |
|---|---|---|---|
| Roles → loans → Koha | 1→3→4→5→6→12→16 | Local state never fabricates Koha loan success | SRC tested; EXT blocked |
| Patron request → staff → inbox/push | 1→8→10→14→18 | Request is visible to staff; delivery is not presumed | SRC tested; device EXT |
| Codespaces → Render → persistence | 2→7→18→19→20 | Same commit starts; persistent state survives deployments | CI boot; live EXT blocked |
| Bibliography → semantics → tasks | 1→11→12→13→15→16→21 | Title/item, authority, status, next action remain consistent | Browser/CI; accessibility EXT |
| PWA/icon → legal → institution | 8→17→19→20 | Software license distinct from library policy and icon rights | SRC; legal signoff open |
| Security claims → enterprise | 6→10→18→21 | No mass mutation count proves live resilience/security | CI; external assessment open |
| **Restore proof (this PR)** | **2→7→18→22** | Hash, byte count, integrity, FK, schema and isolated restore verified before operator recovers | Implementing SRC; Render/offsite EXT blocked |

## C. Applicable standards and controls (no false conformity statements)

1. **NIST SP 800-34 Rev.1** — contingency planning, backup verification, offsite strategy and recovery exercises. Use its *discipline*, not its federal applicability, for R10 DoD. https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final
2. **OWASP ASVS 5.0** — V7 session safety, V16 event provenance/security logging. Existing source tests form a partial trace, not ASVS certification. https://github.com/OWASP/ASVS/tree/master/5.0/en
3. **WCAG 2.2 AA** — keyboard, focus, reflow, input target size. SC 2.5.8 has a 24 CSS px minimum *with exceptions*; LUMEN's 44px target is an internal usability preference, not the normative WCAG minimum. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
4. **IFLA Library Reference Model / MARC 21** — distinguish bibliographic manifestation/title metadata from particular loanable item/copy and circulation authority. These are semantic references, not evidence that a full WEMI/MARC implementation exists. https://www.ifla.org/wp-content/uploads/2019/05/assets/cataloguing/frbr-lrm/ifla-lrm-august-2017_rev201712.pdf
5. **OAuth2/OIDC / Web Push** — user and device identity, tokens, opt-in, no role escalation, no lock-screen leak. Provider delivery must be measured on physical OS/browser.
6. **Render documented disk constraints** — attached disk is single-instance and unavailable at build/pre-deploy; this topology cannot provide zero-downtime deploy or HA. https://render.com/docs/disks
7. **SQLite online backup** — complete WAL-consistent backup snapshot plus integrity/foreign-key checks, crash-safe operator process. A passing local check must not be represented as an offsite backup or timed Render restore.
8. **OSS provenance** — MIT only for original rights-cleared code; direct deps, image provenance and borrowed code require their own licenses/notices. Code openness is not institutional privacy approval.

## D. Prioritised residual lattice and design decision

```text
#1–#21 merged, CI green
     ├── R10 local recovery verification and SHA-bound evidence [NEXT; no external account]
     │      └── R10x real Render HTTPS + persistence + offsite encrypted restore [operator]
     ├── R11 real Koha checkout/return/holds acceptance and IdP lifecycle [institution]
     ├── R9c physical Android/Windows install + Chrome push + WCAG AT [operator]
     ├── R12 target 2,000 concurrent mixed users + soak/fault injection + HA/DR architecture
     └── R13 signed release acceptance, security/privacy/provenance and operational ownership
```

Parallel branches R10x/R11/R9c are independent after their own source controls. **R12/R13 require evidence from all**. If live data is institution-critical or HA is mandatory, the SQLite single-node Render pilot must be re-architected to shared durable storage with new concurrency and recovery qualification.

Priority decision: **R10 first**, because backup file + SHA manifest existed since #2 but a reusable tamper/foreign-key/schema rejecting *offline restore proof* was not in the source/test surface. Small implementation, no additional dependency or front-end ornamentation, high assurance gain. The next task is not another density pass or million-vector counting exercise.

## E. DoD by abstraction

- **Local**: reject missing/symlink/empty/corrupt backup and manifest; SHA-256, byte count, SQLite integrity/FK/schema checks; fail without sensitive-data output or opening live DB for writes.
- **Intermediate**: snapshot copied to ephemeral isolated directory with guaranteed cleanup; distinguish source changed after backup from snapshot; integrate `npm run verify:recovery` with CI and operator runbook.
- **Global CI**: exact commit passes `npm ci`, `npm run check`, `npm test`, Codespaces boot and browser acceptance; evidence is local **PASS**.
- **Global external**: live Render revision canary, offsite storage separated from Render disk, encrypted storage/access ownership, periodic restore and timed RTO/RPO, independent security, 2,000-user integrated target → **BLOCKED until operator evidence**.
- **Adversarial**: replace good snapshot with SQLite file of wrong schema, orphaned FK, modified bytes, forged manifest and missing copy; all fail closed.

**Governance rule:** any UI/operator feature based on recovery status must expose `PASS | FAIL | BLOCKED` and the source of proof. Runtime test PASS cannot be upgraded to enterprise certification by inference.

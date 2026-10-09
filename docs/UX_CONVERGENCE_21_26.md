# LUMEN — Six semantic cuts consolidated into one PR

Baseline: `main` at `73ba5f6d154f54f5b7dd472af2d4eddeb6a2ceb5` (PR #20 already merged).
**C21–C26 are six HYPOTHETICAL cuts, not existing GitHub PRs.** This branch expresses them as consecutive semantic commits in **one real PR**. Names are contract IDs, not invented pull request numbers.

## Why a single PR and atomic commits

The pre-existing R1–R20 implementation already contains role-based navigation, UX-S1–S6, CSS density budgets, receipts, browser screenshot audit and a **separate** one-million BIME security input gate. Replacing these with six overlapping feature branches would raise merge conflict and regression surface without adding authority. The minimal dependency chain is:

```text
C21 role/task projection
  → C22 compact UI composition + offline cache
  → C23 source-confirmed empty/recovery paths
  → C24 measurable CSS density + real browser acceptance
  → C25 source-level falsification + distinct 1m UX input permutations
  → C26 CI release gate, SHA-bound report, review and rollback contract
```

A single PR limits review and deploy synchronization while retaining individual commit boundaries for targeted review and revert. **Do not confuse this choice with automatic certification.**

## End-user effect / technical contract / DoD

| Cut | User expectation | Implementation | Local DoD |
|---|---|---|---|
| C21 — Guidance | “I immediately recognize my next task.” | `nextJourney` pure guest/student/faculty/staff selector; Koha is bibliographic-only; offline blocks implicit actions | 3-role/guest and denied/offline oracle tests; no RBAC grants |
| C22 — Composition | “The obvious task is first, without another giant dashboard.” | One quiet featured item reuses existing `taskLinks`; no new card or dependency; SW caches selector | Exactly one featured affordance, same existing destination and role entitlement |
| C23 — Missing data | “No record means no record, not a disconnected service.” | `verifiedEmpty` produces contextual recovery only after a confirmed zero-row result | Unknown/unconfirmed never presented as empty; no mutation or Koha inference |
| C24 — Density | “I can navigate at 320px and 200% text without horizontal scrolling.” | Spacing and modest emphasis inside existing task list; simple empty CTA | real Chromium desktop/Android-emulated tests, 44px tap target, mobile reflow |
| C25 — Epistemic audit | “States like constructor, unknown or inherited keys never appear as valid statuses.” | Own-property checks for status dictionary; exact booleans for empty search; independent oracles | 1,000,000 **distinct input vectors**, 4,000,000 property assertions; 6 synthetic corruptions rejected |
| C26 — Release governance | “Reviewers know what passed and what still requires people or real systems.” | GitHub Action with commit-bound artifact and product-grade operating instructions | full Node + browser CI, exact SHA, documented rollback and blocked external gates |

## Mutation methodology and honesty

`npm run ux:mutations` deterministically enumerates exactly 1,000,000 unique vectors from a larger mixed-radix Cartesian product across ten dimensions: role, authentication, source, provider enabled, online state, empty-kind, confirmed flag, search flag, local available count and hold state. Independent hardcoded domain tables check the semantic route, provenance/authority, verified emptiness, availability, and safe status classification. `37 * i + 173 (mod N)` is a permutation because `gcd(37,N)=1`; no sampled vector is repeated.

The script rejects six **deliberately corrupted expected outputs**: role escalation, fake Koha routing, offline action, unverified emptiness, phantom reset CTA and prototype-key status. These are controlled synthetic oracles—not mutation of executable program ASTs and **not** a claim of six escaped bugs or a coverage percentage. The SHA-256 witness and counters are saved in the GitHub Actions artifact at the exact triggering commit. The older 1m `BIME_TRUST_BOUNDARY_MUTATIONS` remains an independent security gate; it is not counted as new UX evidence.

The gate **does not** execute one million authenticated browser sessions, prove WCAG 2.2 AA, authenticate an external IdP, certify Koha or demonstrate 2,000 concurrent clients.

## Decision boundaries and sources

- LUMEN standalone SQLite remains source of truth for local copies/holds and in-app inbox. An empty catalog list is confirmed by its completed HTTP response, never inferred after a timeout.
- A Koha catalogue record is bibliographic evidence, **not** proof of item availability. A navigation selector cannot create a Koha checkout or grant rights.
- Authenticated role affects editorial task priority; the existing server RBAC still decides access.
- Web Push remains opt-in/best-effort, and “sent” is provider acceptance, not evidence of device display.
- Installability is browser/OS-controlled, not native Android APK.
- 320px, 44px, 200% text and compact-hero dimensions are LUMEN internal design budgets; WCAG 2.2 AA still needs independent accessibility assessment.

## Operator commands

**Actual product, from fresh GitHub Codespaces**:

```bash
npm run dev
```

Open forwarded private port **3000**. Missing `npm` in an old Codespace: **Rebuild Container** to apply the Node 24 devcontainer.

**Optional proof (Node 24):**

```bash
npm ci
npm test
npm run ux:mutations
npm run verify:boot
npm run verify:deploy
npm --prefix browser ci
npm --prefix browser exec -- playwright install chromium
npm run test:browser
```

**Render standalone pilot:** Blueprint `render.yaml`, first administrator secrets, `npm start` with prestart preflight and single-node attached SQLite disk. After an actual Render deploy, use `EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://your-service.onrender.com`. The repository/CI does not itself provision Render.

## Release state gates

**Local & intermediate:** Node + real browser CI on the PR HEAD must be green, and a zero-row API response must be distinguishable from network failure.

**Global/code:** `ux-million.json` must report precisely one million distinct vectors, four million oracle checks, six rejected synthetic mutants, and the triggering commit SHA; otherwise the PR is **not** a merge candidate.

**External/enterprise — BLOCKED:** actual Render provisioning/restart/offsite backup restore, real Koha/IdP end-to-end acceptance, physical Android/Windows install and Web Push, WCAG screen-reader review, independent security/privacy review, realistic 2,000-user mixed load and HA/DR qualification. LUMEN is not enterprise-certified while these remain open.

## Rollback

Revert the **single squash-free PR merge** if a new presentation path breaks. The commits add browser-only presentation modules/tests and **no database migration, permissions or new runtime dependency**. Existing service/Koha/OIDC interfaces are unchanged. The service-worker cache key advances to `lumen-static-v9`; a browser may need to reload to pick up new cached modules.

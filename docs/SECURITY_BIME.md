# BIME — LUMEN security assessment and bounded mutation evidence

**R14 class:** defensive patch / unit+HTTP+static+SCA audit. This is not an external penetration test or a certification. Revision-bound CI evidence is attached to [PR #18](https://github.com/Luke883i/lumen/pull/18).

## One compositional method from eight dominant assessment practices

`BIME = Boundary → Invariant → Mutation → Evidence → Fix → Regression`.

| Practice | Collapsed function |
|---|---|
| STRIDE threat modeling | identify attacker, asset, trust boundary and path |
| OWASP ASVS 5.0 | articulate checkable security requirements, notably V7 sessions |
| OWASP API Top 10 (2023) | enumerate object-access, authentication and privilege risks |
| Static code review / SAST | locate concrete flaws and injection surfaces |
| DAST / HTTP integration | verify status codes, cookies and forbidden transitions |
| Property / mutation fuzzing | falsify invariant across deterministic adversarial inputs |
| Dependency SCA | CI `npm audit --omit=dev --audit-level=high` |
| Configuration / DevSecOps review | verify secure origin, cookies, PWA, preflight and deploy gates |

References: [OWASP ASVS 5.0](https://owasp.org/projects/asvs), [OWASP API Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/), [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final).

## Findings and remediation ledger

| ID / severity (engineering) | Before | R14 correction | Regression proof |
|---|---|---|---|
| SEC-01 high | Password rotation invalidated server sessions but left associated Web Push device targets | Atomic account-wide deletion of push subscriptions on password change | `test/security-boundaries.test.mjs` |
| SEC-02 high | Local session-limit eviction removed sessions but retained orphaned push subscriptions | Transactionally prune orphaned push subscriptions after session eviction/expiry cleanup | BIME session capacity + expiry unit tests |
| SEC-03 high | OIDC session cap likewise removed session rows without deleting related push endpoints | Same shared pruning invariant on OIDC login | Existing OIDC suite + specific follow-up test |
| SEC-04 medium | Production origin policy admitted HTTP origin on same Host; malformed Origin could throw 500 | Strict Origin serialization and required HTTPS in production, deterministic 403 | One-million boundary mutations + HTTP rejection |
| SEC-05 medium | Malformed percent-encoding in cookies/path identifiers produced internal server errors | Invalid session cookie interpreted as no session; invalid path ID returns 400 | HTTP negative mutation tests |
| SEC-06 defense-in-depth | No HSTS | 180-day HSTS only when `NODE_ENV=production`; no includeSubDomains blanket | Source inspection and protected-header verification |
| SEC-07 supply-chain | Dependency exposure not a required security release gate | Exact-SHA CI `npm audit` high/critical check | BIME workflow |

**1,000,000 mutation contract.** `npm run security:mutations` executes exactly one million generated `Origin × Host × production` trust-boundary cases over 20 deterministic classes (150,000 accepted / 850,000 rejected) and asserts an independent class oracle for every case. The report includes SHA-256 witness, Git revision, counts and limits. Each iteration is an **input mutation**, not a distinct program mutation, full HTTP request, exploit, security proof or independent pentest. Node/HTTP tests cover actual runtime calls at smaller but higher-value sample sizes. These observations are complementary, not interchangeable.

## DoD

**Local:** fail-closed branch truth; no staff/student privilege leakage; all newly introduced utilities are tested; malformed input never generates 500.

**Intermediate:** revocation after password change, session cap and expiration, OIDC renewal. Transport delivery for invalidated sessions cannot continue via orphan binding. No delivery-reliance claim from an accepted push response.

**Global code:** `npm ci`, `npm test`, `npm run check`, `npm run security:mutations`, `npm audit --omit=dev --audit-level=high`, browser CI and ordinary CI must pass on **same Git SHA**. Store CI logs as audit artifacts.

**Production:** still BLOCKED pending independent authenticated DAST/pentest, secure gateway rate-limiting, real OIDC and Koha security review, Android/Windows privacy checks, backup/restore and 2,000-authenticated-user fault/load tests. No enterprise security certification is inferred from R14.

## Residual risk and explicit acceptance debt

- **SEC-R1 (open):** login limiter is in-memory, per-process and keyed partly by untrusted request metadata; it does not provide distributed WAF/bot mitigation or durable/account-wide throttling. Use a managed edge gateway and verify real-world behavior before exposure.
- **SEC-R2 (open):** password/session authentication has a 12-hour absolute lifetime but no evidence-backed idle-timeout policy; coordinate with the institution/IdP and test revocation.
- **SEC-R3 (open):** browser Web Push already accepted by upstream provider **cannot be recalled**; keep payloads generic.
- **SEC-R4 (open):** SQLite single-instance Render blueprint is not high availability, and backup on the same disk is not disaster recovery.
- **SEC-R5 (open):** source review / npm audit cannot replace a third-party penetration test, secrets scanning, license assessment or a qualified threat assessment of deployed external systems.

## Operator path (unchanged)

Codespaces freshly created from Node 24 devcontainer: `npm run dev` → private forwarded port 3000.
Render single-instance pilot: `npm start` after automatic production preflight; verify real Render SHA-bound canary separately.

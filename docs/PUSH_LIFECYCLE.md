# R9b — Web Push lifecycle and acceptance contract

**Status:** source-level implementation; real Chrome/OS push certification pending.

## Core invariants
- The inbox owns notification content and recipient truth. Push is optional, best-effort, and lock-screen-safe.
- An active login session is required to register a device. HTTPS provider allowlist, valid P-256 public key and 16-byte authentication key are mandatory.
- An endpoint cannot be silently reassigned between accounts. A new account receives `409 PUSH_ENDPOINT_IN_USE`; the original owner remains unchanged.
- Same-account reenrollment can attach the device to a newer session. Logout revokes only bindings of the displaced session; disabled accounts lose all devices.
- Switching accounts without explicit logout (password or OIDC) revokes bindings associated with the prior browser login.
- Worker checks recipient activity, endpoint ownership, payload and enrollment version before each send. A 404/410 deletes only the version that actually failed.
- An already in-flight push cannot be recalled; payloads therefore contain no patron/book/private details. `sent` means provider acceptance, **not OS delivery or user reading**.

## Migration
The schema adds `subscriptions.session_hash` containing a hash of the enrolling session token. Existing pre-R9b subscriptions cannot prove ownership and are purged once during migration. Inbox messages and accounts remain. Previously opted-in users must opt in again. This is intentional fail-closed behavior; announce it before deployment.

## Definition of Done

| Level | Gate | Evidence |
|---|---|---|
| Local | Validate endpoint host, P-256, auth key, authenticated session | `test/push-lifecycle.test.mjs` |
| Local | Reject cross-user endpoint takeover and stale provider 410 | Domain + worker test |
| Intermediate | Same-account renewal, logout, disable, browser account switch | Domain + HTTP tests |
| Intermediate | Preserve consent states and server-truth status | `test/experience.test.mjs` |
| Global | Entire Node, browser and Codespaces boot regression | CI at exact PR SHA |
| External | Android/Windows Chrome OS push permission, delivery, click, revocation | BLOCKED pending real-device test |
| Enterprise | Live Render + Koha/IdP + 2,000 mixed concurrency + HA/DR + independent security signoff | BLOCKED |

## Remaining minimum lattice

R9b source tests -> R9c real Chrome/VAPID acceptance. In parallel, R10 is Render deploy, persistence and offsite restore; R11 is live Koha/OIDC integration. R12 combines 2,000 active-user load, resilience, privacy, accessibility and independent security tests. R13 accepts or rejects enterprise grade based on archived evidence.

**Codespaces user command remains `npm run dev`**. Render still runs `npm start` from the reviewed Blueprint.

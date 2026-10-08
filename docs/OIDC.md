# R6 — Institutional OIDC identity

Use openid-client 6.8.8 for Authorization Code + PKCE, state, nonce and issuer discovery. The client enables JWS signature validation against the IdP's published JWKS via enableNonRepudiationChecks; validated claims are obtained using the v6 tokens.claims() API, not manually decoded. LUMEN retains its own opaque server-side sessions and role-based authorization.

## Configuration (all required, feature OFF by default)

OIDC_ISSUER=https://identity.university.example
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=https://lumen.example.edu/api/auth/oidc/callback
OIDC_ONLY=0

Register the exact callback URL at the institutional IdP. Store the secret in the deployment secret manager, never in GitHub code or PWA assets. Discovery issuer must be HTTPS. HTTP callback is permitted only for loopback tests.

## Identity / privilege separation

The librarian provisions an account and associates its *stable* provider subject (sub) using POST /api/staff/oidc/bind. Subjects must come from a trusted IdP administration workflow. LUMEN cannot guess or elevate identities from the email string or token groups. Login requires immutable issuer+subject binding, verified email, exact email match, and active account. No auto-provisioning. Professors and librarians retain roles assigned locally by authorized staff.

GET /api/auth/oidc/start sets a one-time, 5-minute flow cookie. Callback validates state, nonce, PKCE, issuer and signed ID Token through openid-client. Only then does LUMEN issue a new opaque HttpOnly session. Callback exchanges code server-side, clears one-time cookie and returns to /me. Replay is rejected.

To make local password login unavailable, set OIDC_ONLY=1 only AFTER mapping and testing at least one librarian; otherwise access may be lost. An operator-controlled rollback of the setting is the recovery path.

## DoD and outstanding evidence

Mock IdP domain/HTTP suite: state expiry/replay, CSRF, role non-escalation, duplicate binding, email_verified, issuer claims, active-user requirement. Real institutional staging IdP, token/signature interoperability, logout and account deprovisioning, high availability and security audit remain OPEN. This is a staged SSO pilot, not enterprise SSO certification.

## Live metadata verification (read-only)

With institutional OIDC environment credentials configured and the exact registered callback, run `GIT_SHA=$(git rev-parse HEAD) npm run oidc:smoke`. The script validates HTTPS issuer/authorization/token/JWKS endpoints, support for response_type code and explicit S256 PKCE metadata. No interactive login or token exchange is performed. PASS is metadata evidence only; production login, JWT signature, claim mapping, session revocation, provider outages and IdP lifecycle still require a controlled staging acceptance test.

## Bounded authentication state

R6 stores only short-lived PKCE verifier, nonce and hashes of browser state/flow. `oidc_flows.expires_at` has an index. A maximum of 20,000 simultaneous pending flows (configurable with `OIDC_FLOW_LIMIT` 1..50000 for tests and capacity planning) fails closed with HTTP 429 rather than consuming unbounded SQLite storage. This does **not** replace edge DDoS protection, IdP login throttling or a 2,000-user production-equivalent load test.

## Institutional token client authentication

Most providers accept `client_secret_post` (default). If your institutional IdP requires HTTP Basic authentication at the token endpoint, set `OIDC_TOKEN_AUTH_METHOD=client_secret_basic`. The allowlist rejects any other method and the same setting is exercised by `npm run oidc:smoke`; no support for public clients or unauthenticated tokens is claimed.

## Session migration and SSO-only cutover

On opening an existing SQLite database, LUMEN adds the `sessions.auth_method` column with default `local`; all legacy password sessions are classified as local. New institutional sessions use `oidc`. When `OIDC_ONLY=1`, even previously issued local session cookies are ignored by the HTTP handler for all protected APIs, while verified OIDC cookies remain valid. This resolves a cutover bypass that the older password-endpoint-only gate did not prevent. Rollout still requires controlled operator verification of one mapped active librarian before enabling the flag.

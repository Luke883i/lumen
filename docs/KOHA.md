# Koha integration gate K1 — catalogue (read-only)

Implemented as an **independent** Koha catalogue source under `/api/integrations/koha/*`. This avoids mixing Koha authority with standalone SQLite circulation. The bridge supports OAuth2 client credentials and the Koha 25.11 biblios, items and libraries endpoints. It uses TLS, a 6.5-second timeout and denies redirects. Local mock contract tests do not certify a live instance.

## Configure

Enable `RESTOAuth2ClientCredentials` in the Koha system preferences; grant the service patron `catalogue` permission. Obtain a client ID and secret from that patron, then configure on the LUMEN server:

```bash
export KOHA_BASE_URL="https://your-koha.example.edu"
export KOHA_CLIENT_ID="..."
export KOHA_CLIENT_SECRET="..."
npm start
```

The host must be HTTPS (only tests may use HTTP loopback). Do **not** use a browser-supplied Koha URL. Credentials are never returned to the frontend.

- `GET /api/integrations/koha/status` checks the real API.
- `GET /api/integrations/koha/books?q=term` queries bibliographic records.
- `GET /api/integrations/koha/books/123` fetches record and item metadata.

## Mandatory K2-K5 gates

- K2: test against a controlled Koha 25.11 instance, with records, patrons, copies, hold policies and permission fixtures.
- K3: map LUMEN authenticated identities to Koha patron identifiers; choose a SINGLE authoritative hold/loan engine, no parallel SQLite mutation of Koha items.
- K4: validate hold/checkout/return/renew APIs, errors, retry reconciliation and origin library policies against Koha; write APIs must never claim success without Koha receipt.
- K5: operations, live credentials rotation, API compatibility regression, scoped permission review and actual 2,000-user workload.

Until K2–K5 pass, **Koha integration is catalogue read-only** and enterprise circulation through Koha is **NOT implemented**.

References: https://api.koha-community.org/25.11.html and https://koha-community.org/manual/latest/en/html/webservices.html

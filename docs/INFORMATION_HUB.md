# LUMEN — informational UI and library-policy publishing boundary

This feature provides in-app **information**, **usage explanations**, **library-owned policy links**, and existing **open-source notices**. It does not replace institutional legal approval.

## Routes and end-user intent

- `/informazioni`: public identity of the operating library (if configured), links to terms, privacy, accessibility and support, and separate link to software notices.
- `/condizioni`: clear description of *how LUMEN behaves*: holds may queue, faculty acquisition suggestions do not constitute purchases, inbox is authoritative and Web Push is best effort; explicit distinction from library's binding rules.
- `/opensource`: already-existing source-qualified license/technical stack page; MIT software license, Node/SQLite/Web Push/OIDC, optional Koha connector, test-only Playwright, and referenced-but-not-installed projects.
- Global footer links appear for anonymous, student, faculty and librarian; no authentication prerequisite.

## Institution owner-configurable entries

Public values in the application config are exposed only after HTTPS URL sanitization:

```text
LUMEN_INSTITUTION_NAME=
LUMEN_SERVICE_TERMS_URL=
LUMEN_PRIVACY_URL=
LUMEN_ACCESSIBILITY_URL=
LUMEN_SUPPORT_URL=
```

Blank / invalid URLs are visibly **not configured** rather than replaced with fabricated institutional content. Do not put personal data or credentials in these fields. Neither the repository MIT grant nor LUMEN UI can approve another institution's circulation rules, GDPR notice, accessibility declaration, or support SLA.

**Owner approval gate:** before advertising an institution-specific public service, the operating library approves and publishes its identity, terms, privacy, accessibility and contact details. The legal rights review of the original software and any imported assets remains independent (see `docs/USAGE_TERMS.md` and `docs/THIRD_PARTY_NOTICES.md`).

## Review and falsification

- Unit: missing/valid/malformed HTTPS references, no implicit operator or legal authority.
- HTTP: anonymous public `/informazioni`, `/condizioni`, `/opensource`; public config omits secret values.
- Browser: same source information accessible with all three roles and in Android emulation; 1 h1, functional links, no horizontal overflow.
- UI: shared design tokens, compact 2-column cards (one column at narrow sizes), one clear destination to binding policies; no oversized legal cards.
- Live Render, real Koha/IdP, physical OS installation, 2,000 concurrent sessions and external legal sign-off are separate **BLOCKED** release gates.

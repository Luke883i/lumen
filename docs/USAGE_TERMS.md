# LUMEN — open-source software license and operating responsibilities

**Software terms (proposed for approval by the rights holder).** The original LUMEN
repository code and its documentation are offered under the [MIT License](../LICENSE).
MIT allows use, modification, redistribution and commercial use subject to preserving
the copyright and permission notice. The software is supplied **AS IS**, without
warranty. Keeping `private: true` in `package.json` prevents accidental npm
publication; it does **not** make a public repository proprietary.

**Provenance/rights gate (still requires maintainer sign-off).** Confirm that the
repository owner and all contributors with relevant rights can grant MIT for their
original code, icons, documentation and any external material. The 18 PR merge
history does not itself prove ownership or the right to relicense third-party code.
Do not merge/release a licensing claim until that review is completed.

**External libraries retain their own licenses.** See
[third-party notices](THIRD_PARTY_NOTICES.md). The MIT grant in LUMEN does **not**
relicense Koha, Node.js, SQLite, web-push, openid-client, Playwright, FOLIO,
Evergreen, SLiMS or Invenio. Koha is accessed over its supported REST API only when
configured; its GPL-3.0-or-later licensing is independent. This is an engineering
boundary statement, not a definitive legal compatibility opinion.

## Software freedom vs. library service policies

The MIT license covers the LUMEN software, **not** an institution's patron data,
book metadata, electronic resources, terms of borrowing, privacy policy, or service
commitments. The **library operator** must separately establish and publish its
own binding policies before public production use. At minimum:

1. Identity and contact information of the operating institution and support channel.
2. Patron eligibility, loan limits, pickup, renewal, holds, overdue handling and
   appeal/correction procedures, using the authoritative circulation rules.
3. Data controller/processor roles, lawful basis, privacy notice, categories of
   data, retention/deletion, rights requests, international transfers where relevant,
   breach handling, and any institutional GDPR/DPIA assessments required.
4. Operational consent and browser/OS settings for optional Web Push; the in-app
   notification inbox is authoritative and delivery to a device is best effort.
5. Accessibility statement, incident contact, supported browsers, backups, downtime
   expectations and user support arrangements.
6. Koha / institutional IdP setup and institutional responsibility for credentials,
   configuration, integration acceptance, security and update processes.

Do not publish fictitious hours, loan rules, email addresses, privacy notices,
compliance certifications or SLAs on behalf of an unnamed library.

## Use, installation, security and support

- Development: create a new Codespace, then `npm run dev` (private forwarded port 3000).
- Render controlled pilot: `render.yaml`, `npm start`, exact-SHA live smoke, offsite
  backup and restoration acceptance described in [BOOT_DEPLOY.md](BOOT_DEPLOY.md).
- The out-of-box demo accounts and sample collection are **for local development**.
- Running a public multi-user library is not automatically certified merely by
  enabling production mode, SSO or Koha flags.
- Security reports and contributions: use GitHub issues/PRs without posting keys,
  passwords, patron data, session cookies or sensitive details; privately contact
  the repository maintainer for exploitable vulnerabilities.

Nothing in this document is a separately accepted end-user contract or a substitute
for institutional legal review. The canonical MIT text is the repository-root LICENSE.

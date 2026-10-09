# LUMEN — Evidence-bound runtime and visual audit

## Goal and limits

Run the real app, not visual mockups. **Headless Chromium** executes the actual `npm run dev` backend with isolated `LUMEN_DB_PATH=:memory:` and demo records in GitHub Actions. The local container in this conversation cannot DNS-resolve github.com, so a clone here was not possible; no local execution is claimed.

The screenshot matrix is captured for **Desktop Chrome Chromium** and **Pixel Android emulation**. OS home-screen installation and push permission/delivery must be tested on physical devices separately.

## Scenarios and semantic ontology

| Screenshot ID | User | Business expectation | Authority boundary |
|---|---|---|---|
| 00 | Guest home | Immediately discover search and product value | Local catalog; no stock promises |
| 01 | Guest catalog | Find title/author/ISBN, detailed copy states | Local catalog / not Koha |
| 02 | Guest info | Determine institution, policies and support | Operator-owned links; unknown stays unknown |
| 03 | Guest usage | Understand holds vs loan and proposals vs purchases | Explanatory only, not signed terms |
| 04 | Guest OSS | Distinguish LUMEN, Node, SQLite, web-push, OIDC, optional Koha and research references | Repository notices and actual imports |
| 05 | Student area | See loans, holds and next steps | Local receipts |
| 06 | Student inbox | See delivered-to-app alerts, not assume OS push | LUMEN inbox |
| 07 | Faculty acquisition | Propose a title, follow request | Proposal ≠ purchase |
| 08 | Staff overview | Prioritize work without giant cards | Server staff stats |
| 09 | Staff circulation | Work pending holds/loans and ensure legal actions | Local circulation / separate Koha |
| 10 | Staff acquisition | Review faculty proposals | Server role/authorization |
| 11 | Staff communications | Send inbox notices by role | Inbox is authoritative; Web Push optional |

Each PNG is accompanied by `role-audit.json` with an exact SHA, user role, page purpose, authority, headings hierarchy, CTA labels, computed element bounds, visible badges, overflow, missing policy references, and falsification flags. The screenshot images and machine-readable JSON are archived by GitHub Actions as **`lumen-ux-s4-density-<SHA>`**.

### Automated measurements and DoD
- Main H1 exactly one, no unlabeled primary CTA, and no horizontal overflow at tested viewports.
- Home hero ≤240 CSS px desktop / ≤180 mobile; actionable targets ≥24px minimum, with LUMEN preference 44px.
- Terms/info/OSS discoverable from any role via compact footer; policy links never falsely published.
- Screenshots actual browser captures with HTML/CSS response from LUMEN runtime, not generated illustrations.
- Semantic detail evaluated per screenshot using role, task and source/authority. Warnings are preserved as evidence, not transformed into silent PASS.
- Data is demo-only; no patron PII, VAPID secrets, SSO tokens or real operational logs are put into artifacts.
- Existing R1–R9b browser workflows, Node tests, Render static contract, and Codespaces bootstrap should remain green.

### Open evidence gaps
The runtime pilot is not automatically enterprise-ready. Actual Render deployment and persistent restore, real Koha/IdP, offsite backups, real PWA/push on devices, WCAG assistive technology review, 2,000 concurrent sessions and operational legal signoff remain blocked.

## Local instructions (when a Codespace is available)

```bash
npm run dev
```

For browser audit:
```bash
npm --prefix browser ci
npm --prefix browser exec -- playwright install chromium
npm --prefix browser exec -- playwright test --config playwright.config.mjs tests/role-audit.spec.mjs
```

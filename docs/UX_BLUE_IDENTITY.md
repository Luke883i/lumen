# LUMEN — UX-S6A Blue Visual System

**Scope:** unified identity and surface hierarchy, without changing domain authorization, API responses, role workflows or UX-S4 compactness.

## Product meaning

The product should look immediately institutional and contemporary, not like a decorative dashboard. Blue conveys navigation, reliability and task progress; a limited sky-blue accent distinguishes search and installation. Gradients establish **one** primary decision area per view. Semantic states must remain unambiguous: green for successfully available/recorded, amber for waiting or uncertainty, red for failure or destructive action.

## Source of truth

`public/style.css :root` is canonical. Avoid new CSS-in-JS, UI frameworks or runtime theme dependency.

| Semantic token | Value | Use |
|---|---|---|
| `--lumen-ink` | `#0b2550` | Brand navy, headings, toolbar and OS theme |
| `--lumen-blue` | `#2053b5` | Active tasks, navigation and accents |
| `--lumen-sky` | `#bfebff` | Highlight against navy, never body copy on white |
| `--lumen-body` | `#243957` | Readable long-form text |
| `--lumen-paper` | `#f4f8ff` | Light page background |
| `--lumen-muted` | `#50647f` | Secondary information |
| `--lumen-gradient-hero` | navy → royal blue | Home primary search only |
| `--lumen-gradient-cta` | royal blue → deep blue | One primary action for each decision |
| `--lumen-gradient-sky` | sky blue → pale ice | Search action, subtle install surface |
| Status success | `#125a43` on `#e9f7ef` | Confirmed availability / positive outcome |
| Status warning | `#805000` on `#fff2d9` | Queue, pending verification |
| Status danger | `#a3273f` | Errors and destructive action |
| Keyboard focus | `#164ab4` on white; `#c1eaff` on navy | Visible without relying on animations |

All colors are documented in CSS and tested with a contrast calculator. White typography on the three stops of both dark gradients and dark typography on the sky-gradient stops must meet at least **4.5:1** for normal text. Focus indicators must be discernible; contrast of a selected UI indicator against surrounding color is reviewed separately.

## Design system by abstraction

**Global:** CSS design tokens, OS/PWA theme, installable SVG + 192/512 PNG icons, browser light palette, keyboard focus and reduced-motion safeguard.

**Intermediate:** low-chrome top navigation, task hub, crisp white cards, restrained shadows, selected staff workspace, compact hero with ONE visual gradient and clean page backgrounds. Gradients are *not* applied to lists, book tiles, metrics or ordinary navigation.

**Local:** compact book covers, reserve/request buttons, state chips, staff notice receipts, alert/toast, modal and push settings. Availability, pending and failure keep their server-backed semantics; color never substitutes for text.

## DoD and falsification

- **Local:** no old teal/gold token names, no old brand hex in delivered manifest, header, SVG, CSS and icons; gradient overrides must not make a sky search button illegible.
- **Intermediate:** hero remains ≤240px desktop and ≤180px on the tested mobile viewport, no horizontal overflow; tap targets stay unchanged; content cards remain flat, with no large decoration.
- **Global:** `npm run check`, `npm test`, `npm run verify:boot`, `npm run verify:deploy` and Chromium desktop/Android-emulated acceptance on the exact commit SHA. Decoded PNG sizes match manifest; service-worker cache rotates to include new assets.
- **External/epistemic:** Android physical installation, Windows PWA icon refresh after prior installation, contrast at 200% zoom, manual screen-reader/keyboard review and real Render deployment still need human/device evidence. Old installs may retain cached icons temporarily; browser uninstall/reinstall may be necessary.

## Governance and next slices

UX-S6B: final composition/contrast reflow audit and measured visual acceptance. In parallel, R10 Render live+offsite recovery, R11 Koha/IdP real acceptance, R9c physical Chrome PWA/push. R12 capacity/HA/security, R13 release signoff remain necessary for enterprise-grade ILS. **Palette work never authorizes claims of enterprise production readiness.**

## Rollback

This PR is presentation-only: revert the branch commit(s) and redeploy; no schema migration or Koha side effect exists. Already installed PWAs may need a service-worker reload/icon refresh after a rollback.

# LUMEN — minimal product lattice / closure contract

**Baseline:** R1–R7 merged as of 2026-10-08. **Desired class:** a pleasant three-role installable library PWA, bootable in Codespaces with `npm run dev`, deployable on Render with `npm start`; enterprise grade only after *external* functional, security, resilience and capacity evidence.

## 1. Intent → executable contract

- **One canonical entrypoint**: a new Codespace runs Node 24 postCreate `npm ci` automatically; one terminal command `npm run dev` starts the PWA, demonstrates all three roles and serves catalog plus local circulation. `npm run verify:boot` validates both terminal entrypoints. Existing Codespaces require image rebuild; never promise that git pull installs npm.
- **Runtime modes are honest**: standalone local demonstration, standalone deployed library, Koha-integrated pilot, and institutional OIDC are separate explicit states. No frontend may label Koha as authoritative unless its feature flags/remote evidence warrant it. Persistent Render disk constrains to a single node; no HA/2,000-user production certification by inference.
- **Zero new UI dependencies**: retain native HTML/CSS/ES modules, existing assets and Web Push worker. Minimize code; centralize copy/tokens and derive UI affordances from actual capabilities.
- **Installation**: web manifest 192/512 pixel icons and identity, start/scope/display, service worker/offline shell, Chrome/Android add-to-home/standalone and Chrome/Windows install UX. Never claim APK or native installation. The browser owns the install permission and may not surface a prompt; show manual steps. Secure HTTPS (or browser-approved local secure origin) required.
- **Notifications**: canonical in-app inbox; Web Push optional with VAPID, explicit user gesture/permission, browser denied/unavailable/offline statuses, unsubscribe, informative messages; SW notification click focuses an existing same-origin LUMEN window. Never claim guaranteed delivery, leak book/person details on the lock screen, or send to an account after deliberate opt-out.
- **Feedback**: branded confirmation dialog and ephemeral toast for initiated actions, empty/loading/error/success states with action and honest copy, aria-live, keyboard focus/Escape, 44px touch targets, reduced motion support. No popup on normal navigation or on initial render.
- **Roles**: anonymous (discovery/access), student (search/holds/renewals/alerts), faculty (+ acquisitions), librarian (staff controls/reconciliation/broadcast). UI hiding is **not** authorization; backend RBAC remains mandatory.
- **Institution-provided text**: never invent opening hours, branch names, contacts, loan durations or availability. Minimal semantic descriptions and configuration-needed language until the library supplies facts.

## 2. Minimal dependency lattice

```text
              R7 MERGED (Node 24, Codespaces, Render, SHA-bound canary)
                                |
                    R8 UI + PWA (this PR)
                       /                 \
             R9 browser E2E        R9b Push hardening
                       \                 /
                        R10 Render canary + backup restore
                         /                \
             R11 Koha live         R11 IdP live
                         \                /
                      R12 security & 2000 load on target
                                |
                     R13 enterprise release signoff
```

- **R8 (now)**: branded global/intermediate/local design tokens, truthful Italian microcopy, action dialog, install-state machine and push preferences; static/unit tests. Mergeable independently of live services.
- **R9 / R9b**: test actual Android Chrome installation, Windows Chrome window mode, Chrome notification permission and keyboard/focus through a real browser; test failure/offline/reload/error states; push subscription privacy and lifecycle regression.
- **R10**: Render operator deploy through Blueprint, `EXPECTED_SHA=... npm run verify:remote -- https://...`, persisted-state restart, offsite encrypted backup and timed restore artifact (single-node pilot production operability).
- **R11**: live Koha circulation and institutional OIDC acceptance with real test fixtures, staff permissions, policy/refusal and revocation. Requires accounts, credentials and institutional approval; mock green does **not** satisfy.
- **R12**: mixed 2,000 concurrent authenticated users against realistic Koha/Render targets (arrival rates, latency percentiles, queue depths, errors, resource saturation, recovery), HA/DR decision, accessibility, privacy and independent security signoff. SQLite/single instance may require architectural migration.
- **R13**: complete gate matrix, signed evidence/owners, rollback and incident exercises, release decision. An enterprise label is forbidden while any mandatory gate is BLOCKED.

**Minimal cuts:** R8+R9 yields a polished and reproducible *pilot*. R10 yields *operator-deployable production pilot*, not HA. R11+R12+R13 are necessary for substantiated *enterprise ILS* classification. These labels are evidence-based, not PR-count-based.

## 3. UI ontology: global / intermediate / local

| Level | Elements / contracts | Owner of truth |
|---|---|---|
| Global | Brand LUMEN, navy/teal/amber palette, typography, spacing 4/8/12/16/24/32, radius 12/20/28, focus, motion, service worker, install & push policy | Design tokens + web platform |
| Intermediate | Responsive shell/header, mobile dock, homepage hero, search, cards, task forms, alerts, snackbars, dialog, empty/error/loader, settings/preferences | LUMEN UI |
| Local | Book cover/title/author/ISBN, copy counts, loans/holds, faculty acquisition request, staff action receipts, unread notifications, explicit Koha badges | Backend endpoints / role + feature gates |
| Institutional | Library display name, address, hours, policies, pickup instructions, privacy & accessibility notices | Library (must configure before public claim) |

### Required human-facing state machines

- Install: `already_installed | prompt_available | manual_android | manual_desktop | manual_ios | unsupported`. Only a real `beforeinstallprompt` event can trigger programmatic prompt; install success is observed via `appinstalled`/display-mode.
- Push: `server_unconfigured | unsupported | not_requested | granted | denied | subscribed | subscription_failed`. Consent is user initiated. Notification UI always has inbox fallback and state-specific guidance.
- Mutation: `idle | submitting | confirmed | rejected | uncertain | reconciliation_required`. For Koha operations a timeout is **not** converted into success or silent retry. Never expose a generalized success message for denied install/consent.
- View: `loading | content | empty | error` and session `guest | authenticated | expired`; all text describes the real outcome and next action.

### State-partition coverage

Define dimensions `role(4) × login(3) × authority(4) × platform(4) × push(5) × network(2) × mutation(6)` = **11,520 abstract combinations** before pruning impossible or irrelevant states. Do not claim to execute all 11,520 combinations. Apply deterministic invariant tests to each transition and pairwise coverage across reachable combinations; supplement real mobile/desktop/browser accessibility acceptance.

## 4. Definition of Done

- **Local**: every new helper has explicit returned states and mutation tests; no extra dependency; no alert/confirm blocking accessibility if native dialog available; meaningful labels and focus return.
- **Intermediate**: pages and role menus remain functional; install copy responds to platform/prompt; notification consent is not auto-requested; push opt-out and click routing are safe; CSS mobile/reduced-motion/color contrast verified.
- **Global runtime**: Codespaces `npm run dev`, Render `npm start`, GitHub CI, Node 24, PWA manifest, icons, SW and owner-provenance unchanged; `npm run verify:boot` and Render contract are green on the exact branch SHA.
- **External certification**: Chrome Android/Windows manual install and post-install UX proof, real push delivery, actual Render health/backup restoration, Koha/IdP integration, independent security/accessibility, 2k sustained load and failover evidence are attached to the release SHA. Not inferable from static tests.

## 5. Explicit anti-goals / falsifiers

No duplicate catalog/loan authority, React/Tailwind/third-party notification SDK for aesthetic polish, captive install prompts, permission requests during page load, fictional library facts, broad persistent push content, anonymous system alerts, auto-granted staff access, repeat of uncertain Koha POSTs, or promises of native Android APK.

**Fail the release** if `npm` is absent in a *new* Codespace, a fresh `npm run dev` does not serve the PWA, a user is told notifications work with missing VAPID, install button claims installation on browsers without prompt, SW opens a cross-origin URL, or Render pilot is described as enterprise certified.

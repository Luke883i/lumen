# LUMEN — R8 browser and device acceptance

**Purpose:** turn feature flags, mobile PWA behavior and UX copy into observable evidence. This is an operator-executed checklist, **not** evidence that the checks have already passed.

## Staging prerequisites

- Code revision = `git rev-parse HEAD`, CI green, `npm run verify:boot` green, Render `npm run verify:remote -- https://STAGING.onrender.com` matches the deployed commit.
- Browser/devices: Chrome Android (modern Android device), Chrome/Edge Windows desktop, keyboard-only desktop; optionally Safari iOS for manual Add to Home Screen.
- Production-like HTTPS origin with VAPID environment values *only* for the push subtests. An unconfigured VAPID environment is a separate negative test.
- Test-only LUMEN accounts for student, faculty and librarian; **do not** expose the public Codespaces demo users on an internet-accessible staging instance.
- Sanitized data: one catalog item, one active loan/hold and one staff message per role, never personal/private records in screenshots or notification payloads.

## Exact manual matrix

| ID | Preconditions / mutation | Expected observable result |
|---|---|---|
| I1 | Fresh Chrome Android, open HTTPS `/installazione`, no install event yet | Accurate browser-menu guidance, not an inert `Installa` button |
| I2 | `beforeinstallprompt` fires and user taps Install | Browser-owned prompt; user may accept/decline; no premature success claim |
| I3 | Accept installation, open from Android launcher | LUMEN icon/name, standalone window, catalog/search and login work |
| I4 | Chrome Windows desktop menu install, relaunch | LUMEN app window, dedicated task/window icon, normal navigation |
| I5 | Already installed or browser omits prompt | Correct `already installed` or manual guidance; never disabled phantom CTA |
| I6 | Browser offline, navigate to installed PWA | Cached application shell appears; API-dependent features report unavailable rather than fake data |
| N1 | Server VAPID unset | Only the in-app inbox offered; no permission request during first paint or initial render |
| N2 | VAPID enabled, user chooses Activate | Browser consent is requested from the click; default/denied/granted states explained |
| N3 | Permission denied in Chrome | Browser settings guidance, inbox remains usable; no repeated unsolicited prompt |
| N4 | User opts in and librarian broadcasts to **student** category | Only test students see a new inbox record; Chrome push appears when delivery works |
| N5 | Notification shown with lock screen visible | Only generic LUMEN category + body; no patron name, title, overdue details or personal data |
| N6 | Tap system push while LUMEN tab open | Existing same-origin tab is focused and routed to `/notifiche` |
| N7 | Tap push with no open tab | Open standalone/browser LUMEN `/notifiche`, never a cross-origin URL |
| N8 | Choose Disable and then send another test broadcast | This device receives no further push (server subscription removed); inbox still records the message |
| N9 | Re-enable and then Log out | Push subscription for the signed-out account is removed before logout; later push must not expose prior account data |
| UX1 | Student and faculty logged in | Faculty sees acquisitions; student does not; neither sees staff-only actions |
| UX2 | Librarian logged in | Staff operations remain accessible; irreversible actions open LUMEN dialog with cancel + explicit confirm |
| UX3 | Keyboard only: Tab, Shift+Tab, Enter, Escape | Focus visible, modal focus trapped by native dialog, Escape cancels, focus returns to trigger |
| UX4 | 320px Android viewport, 200% zoom, reduced motion | No horizontal overflow or inaccessible CTA; reduced motion respected |
| UX5 | Induce offline/401/403/Koha timeout in controlled staging | Honest error/blocked/uncertain copy and recovery action; no generic success on failed operation |

### Required evidence per scenario

`{commitSHA, URL_origin, OS, browser_version, testID, timestamp, result(PASS|FAIL|BLOCKED), screenshot_or_log_ref, reviewer}`.

For browser-owned installation, attach device screenshot showing the actual LUMEN icon/standalone window; for push attach a test-only device and redacted browser diagnostics. VAPID keys, session cookies, patron data and IdP tokens are forbidden in evidence.

## Human-readable UX DoD

**Global:** consistent LUMEN navy/teal/amber styles, icon, privacy-safe toast/push, typography, focus and reduced motion. **Intermediate:** responsive shell, search, login, empty/error/pending pages, dialog, settings, install guide. **Local:** catalog/badge, hold/loan/acquisition status, staff receipt and segmented notification state, correct role-specific actions.

All observable claims must be supported by the server or real browser event. Chrome/Android PWA install remains a web app in standalone mode, **not** a shipped Android APK. Notification UI is OS-rendered, although the brand, icon and privacy-safe message structure are LUMEN's.

## Enterprise blockers after R8

A green CI + this checklist does **not** prove: tested real Chrome behaviors (R9), real Render persistence/offsite backup restore (R10), production Koha and IdP interoperability (R11), 2,000 concurrent mixed load/HA/security/accessibility (R12), or the independent release signoff (R13).

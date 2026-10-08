# UX-S4 — measured visual compression

Scope: presentation CSS and local decorative markup only. Library authorities, holds, Koha, staff permissions, sessions, PWA, notifications, the Codespaces command and the Render entrypoint remain unchanged.

## Design budget, measured in browser CSS pixels

| Element | Desktop 1440 | Mobile 393 and narrow 320 |
|---|---|---|
| Homepage hero | height at most 240px | height at most 180px |
| Catalogue cover | no more than 64x88px | no more than 64x88px |
| Book detail placeholder | no more than 64x88px | no more than 64x88px |
| Metric card | height at most 112px | height at most 112px |
| Primary/search/compact button | height at least 44px | height at least 44px |
| Horizontal scroll | none | none |

These are LUMEN internal density budgets, not numeric WCAG requirements. They are evaluated at normal default browser text settings with actual Playwright getBoundingClientRect measurements. At 200 percent root font-size the budgets for block heights are deliberately **relaxed**; the tests instead require non-clipped text and reflow with no horizontal overflow.

## Materialized global / intermediate / local changes

Global: reuse 4/8/12/16/24px spacing tokens and navy/teal/amber; smaller visual ornaments, compact type scale on primary layouts. Intermediate: compress Home hero, cards, task hubs, footer and staff panels without hiding primary CTA. Local: book decoration 56x76 desktop, 48x68 mobile, detail 64x88 desktop and 56x80 mobile; metric cards adapt to 2+1 arrangement on narrow screens; action targets remain 44px or larger.

Home moves directly from the heading into the catalogue search and small installation link; the explanatory library context remains in the dedicated existing section. No product fact is removed and no false system status is introduced.

## Executable DoD

- Browser test: 1440x900 desktop, 393x851 Android-sized, 320x700 narrow; measures hero, covers and metrics; checks keyboard-reachable task surfaces and primary action minimum heights.
- Reflow test: simulated 200 percent root text; normal browser layout expansion and no clipped copy or horizontal overflow on Home, catalogue, installation.
- Staff regressions: sections circolazione, catalogo, acquisti, persone and comunicazioni still accessible at narrow width; existing Browser Acceptance and Node service tests must remain green.
- CI attaches JSON bounding-box evidence to the Playwright test report at the triggering Git SHA. Real Android/Windows manual acceptance and screen-reader/contrast review remain separate gates.

## Known limitations and falsifiers

Fail if any normal-scale budget is breached, a long title is truncated, a primary CTA becomes under 44px high, or a browser page overflows horizontally at 320px. Do not artificially cap the height with overflow-hidden to make the test pass. This PR is not a Render live deployment, Koha integration certification or 2,000-user load test.

## Operator commands

Codespaces: `npm run dev` -> forwarded port 3000. Optional visual tests: `npm --prefix browser ci`, `npm --prefix browser exec -- playwright install chromium`, `npm run test:browser`. Render retains `npm start` and existing deploy preflight.

## Tested CI evidence

The first Playwright run found a 200-percent text/reflow defect at narrow 320px width and rejected the PR. The subsequent semantic fix wraps section headings and adjacent action links rather than clipping text. All 44 browser cases were processed on commit 823fb670b5c1b93b4787733264d8ae7414bcbc94 (passing cases with any skip explicitly reported by Playwright). SHA-bound measurements and browser reports are archived as GitHub Actions artifacts. All external qualifications remain separate.

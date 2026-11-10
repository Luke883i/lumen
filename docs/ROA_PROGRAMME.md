# LUMEN in the ROA Research Programme

**Classification:** `LIBRARY_SERVICES_VERTICAL` / `APPLIED` / `APPLIED_SURFACE`.

LUMEN is a user-facing open-source library-services web app for students, faculty and librarians. It is an **applied programme surface** in the constellation coordinated by [academics](https://github.com/Luke883i/academics). [ROA](https://github.com/Luke883i/ROA) is the theoretical anchor of that programme.

The affiliation is a *coordination, discoverability and portfolio topology* statement. It does **not** mean that LUMEN implements ROA/CRC/ECNN or A-OSP, imports their code, formally conforms to the theory, scientifically validates it, or has enterprise ILS certification. No runtime or academic evidence is promoted by a badge.

## Canonical authority and reciprocal reference

- **Programme hub:** [`Luke883i/academics`](https://github.com/Luke883i/academics), `PROGRAMME.json` owns membership, role, directional relations and shared programme-level claim boundaries.
- **Theory:** [`Luke883i/ROA`](https://github.com/Luke883i/ROA) owns its corpus.
- **LUMEN:** this repository owns user journeys, local and Koha-integrated bibliographic contracts, PWA, Codespaces/Render startup, validation and release evidence.
- **Not a dependency:** neither repository needs to clone/import/deploy the other; no bibliographic-data flow exists from LUMEN into ROA.
- **Change protocol:** do not hardcode deployment status, Git SHA, performance numbers, institutional names or test-pass counters into programme membership. Release facts must be verified at the relevant LUMEN commit.

## Canonical public header — v2

The README opens with one exact `<!-- programme-header:v2 -->` shared identity, pointing directly to academics, ROA and CORA. It replaces the old programme badges and `roa-programme-header:v1` marker, which are historical rather than current requirements. LUMEN remains a `LIBRARY_SERVICES_VERTICAL` / `APPLIED_SURFACE` in programme topology, **not** a derived ROA implementation.

The text must preserve that programme membership does not imply shared runtime, formal derivation, scientific validation, certification or production readiness, and that LUMEN-local code and evidence remain authoritative.

## Test boundary

`test/roa-membership.test.mjs` checks the current v2 header and adversarial violations of its local authority and cross-references. It does not prove cross-repository CI policy enforcement or the product's real deployment and user acceptance.

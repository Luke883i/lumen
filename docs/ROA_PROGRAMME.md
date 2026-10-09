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

## Header compatibility

Use `roa-programme-header:v1`, exactly as defined by the [canonical membership header](https://github.com/Luke883i/academics/blob/main/PROGRAMME_HEADER_CONTRACT.md):

```text
hub=Luke883i/academics
framework=Luke883i/ROA
role=LIBRARY_SERVICES_VERTICAL
```

The two Markdown badges and accompanying scope paragraph in [README.md](../README.md) are the only programme-specific changes to the user-facing repository entrypoint. **The installable LUMEN application is unchanged**; its informational pages, library branding and product permissions do not gain any artificial ROA authority.

## Test boundary

`test/roa-membership.test.mjs` checks the immutable v1 header syntax, canonical links, role and anti-entailment text. It cannot prove that the academics PR has been merged or that any research claim is true. Cross-repository reconciliation is a separate academics change.

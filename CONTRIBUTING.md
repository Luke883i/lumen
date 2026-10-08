# Contributing to LUMEN

LUMEN is a small open-source library-services PWA. Report bugs with a minimal
reproduction, expected/actual behavior, and a commit SHA. Never post private
patron, library, IdP or Koha data, credentials or Push endpoint information.

1. Base changes on `main`, keep semantic commits small and use pull requests.
2. For source changes run `npm ci && npm run check && npm test && npm run verify:boot`.
3. For UI changes also run the isolated Playwright browser suite according to
   `browser/README.md`.
4. Mark tests against mocked Koha/IdP or emulated Android as such. Do not claim
   a live integration, 2,000-user capacity or enterprise certification from CI.
5. Link modified behavior to a source-of-truth contract and the affected role.
6. Preserve third-party LICENSE/NOTICE requirements and record new libraries,
   their exact versions and licenses in `docs/THIRD_PARTY_NOTICES.md`.
7. By submitting a contribution intended for inclusion, you represent that you
   have the rights needed to offer your **original contribution under the MIT
   license** in this repository. This is not a copyright assignment.

The repository maintainer must verify rights to earlier code and assets before
adopting the MIT license for the complete history. See `docs/USAGE_TERMS.md`.

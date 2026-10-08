# Load engineering, not a production certificate

The R2 GitHub Action `R2 load evidence (synthetic)` starts **the actual Node runtime** and uses Grafana k6 with 2,000 synthetic browser sessions pre-seeded in SQLite (20,000 book records). It measures mixed authenticated reads, including scoped holds; requests are separated by real server-side session IDs.

Run on a GitHub Actions worker with `LOAD_USERS=2000`, 15s ramp-up, 20s plateau, 10s ramp-down. Test artefact `perf/evidence.json` binds evidence to GitHub commit SHA, input dataset and metrics. Synthetic fixture is gated behind `NODE_ENV=test` and a database filename containing `load`.

**This does not certify a 2,000-concurrent production deployment.** A GH Actions worker is not a Render instance; duration is short; no Koha latency, notifications burst or write-heavy operations are included. Browser rendering, region/network and real permission hierarchy aren't simulated. 2,000 VUs is a user-activity test, not 2,000 simultaneous HTTP operations.

## Enterprise promotion criteria (unmet until evidenced)

L1: 2,000 unique sessions, representative multi-role mix for 60 minutes, realistic catalogue sizes and production-equivalent hardware, 0 lost/duplicated circulation records.
L2: p95 catalogue <= 500 ms, p95 transactions <= 1,500 ms, error rate < 0.5%, measured externally, per-endpoint histograms and load-generator headroom.
L3: concurrency race tests under mixed writes / Koha authoritative holds with integrity reconciliation.
L4: soak/chaos tests, forced restart, disk exhaustion, network partition, recovery, backup-restore.
L5: verified identity OIDC, staff impersonation safeguards, API security review, and GDPR operational controls.
L6: Koha live integration K2-K5 and upgrades rehearsed.

Render SQLite persistent disk permits only one instance and no zero-downtime deployment, so architectural promotion to managed PostgreSQL or a managed Koha cluster will be required if the bottleneck or HA objective demands horizontal scale. See https://render.com/docs/disks .

## Independent write-mutation saturation

The same workflow includes the `write-2000` job. It seeds 2,000 patrons, makes one hold per user and replays every request with the same idempotency key. One in 20 patrons requests the same title, exercising ready/queued capacity semantics. The post-run `scripts/audit-load.mjs` checks: exact 2,000 holds and 2,000 receipts; 1,900 ready, 100 queued; no duplicated active holds, overallocated titles or orphan records; SQLite quick_check ok. This is a synthetic mutation audit, **not** a production-equivalent soak test.

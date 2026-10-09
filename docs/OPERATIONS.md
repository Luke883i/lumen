# LUMEN operations and release runbook

See [BOOT_DEPLOY.md](BOOT_DEPLOY.md) for the canonical reproducible Codespaces -> Render workflow.

## Codespaces (development only)

Open a Codespace using the repository's Node 24 devcontainer (rebuild any pre-existing container), then run `npm run dev`. Only development has demo accounts. Keep forwarded port private. The `postCreateCommand` runs `bash scripts/bootstrap.sh`, which installs exact dependencies from package-lock.json.

## Production Render (single-instance pilot)

Create a Blueprint from `render.yaml`; enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` as secrets. Node 24 is pinned by `.node-version`. `NODE_ENV=production`, `LUMEN_DEMO=0`, and `LUMEN_DB_PATH=/var/data/lumen.sqlite` are in the Blueprint. `npm start` invokes `prestart` and refuses invalid state before binding its HTTP port. The persistent disk is billable; only one service instance is possible and deploys briefly interrupt availability.

## Validate

```bash
npm ci
npm run check
npm test
npm run verify:deploy
npm run verify:boot
npm run preflight
```

These local/CI commands demonstrate a reproducible runtime; they do not provision a real Render service nor validate Koha, IdP or enterprise load.

## Backups, restore and upgrade

Use `npm run backup -- /var/data/backups/lumen-YYYYMMDD.sqlite` on the Render service instance. The Node SQLite online backup API includes concurrent WAL changes and generates a SHA-256 integrity manifest. Export backups **off the Render disk** to independent encrypted storage and test restore into a staging service before relying on recovery. Automatic remote backups, tested RPO/RTO, external retention and HA remain operator obligations.

For rollback, use Render Deploys to select a previous code revision; **database schema migrations are not generally reversible**. Stop the service and restore a verified offsite snapshot when necessary, accounting for transactions after the snapshot.

## Web push

Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` via Render's environment settings if needed. Generate keys with `npx web-push generate-vapid-keys`; do not store secrets in Git. The in-app inbox is authoritative; push delivery is best effort.

## Koha and OIDC

Both integrations are disabled unless explicitly configured. Koha loans and check-ins are not production certified without a real Koha acceptance test. Institutional OIDC requires staged IdP subject binding and verified real login; do not enable `OIDC_ONLY=1` before a mapped active librarian has successfully signed in.

## Current architecture boundary

A Render persistent disk cannot be mounted on multiple instances and prevents zero-downtime deploys. This standalone topology must not be represented as production-ready enterprise capacity for 2,000 concurrent users; that gate requires an infrastructure and data-plane re-evaluation, realistic benchmark, DR/security and institutional signoff.

## After-deploy read-only canary

Run `EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://your-service.onrender.com` from the revision deployed to Render. Requires a real Render HTTPS service; it checks `/api/health`, `/api/version`, PWA manifest and landing page, with strict SHA match.


## R10 non-destructive recovery gate

Before touching production, export the online backup and manifest to an independent, approved offsite location; run `npm run verify:recovery -- /path/to/backup.sqlite` on a copy. A green local gate does **not** close recovery: stage the database on an isolated instance, restart, verify records and time the exercise. Avoid reusing a destination backup filename; existing snapshots are now protected against silent overwrite. See [R10_RECOVERY.md](R10_RECOVERY.md).

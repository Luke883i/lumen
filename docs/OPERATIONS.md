# Operations

## Codespaces
Open **Code → Codespaces → Create codespace**, wait for devcontainer dependencies, then `npm run dev`. Forward port 3000. Local data is in `data/lumen.sqlite`. To reset demo, stop the process and remove `data/lumen.sqlite*`.

## Render
Create a Blueprint from `render.yaml`. This uses a **billable** persistent disk and a single instance. Supply a strong `ADMIN_PASSWORD` (min. 12 characters) and `ADMIN_EMAIL`. `LUMEN_DEMO` must remain unset. `VAPID_*` are optional. Render uses auto-generated HTTPS.

## State persistence and backup
SQLite has WAL mode. Back up consistently using SQLite backup API or `VACUUM INTO` to separate mounted volume; **do not** copy an active main database without WAL coordination. Restore by stopping service, replacing the database with a validated snapshot, restarting and verifying health plus counts. This repo does not automate backups.

## Web push
Run `npx web-push generate-vapid-keys` locally; set PUBLIC/PRIVATE and SUBECT (mailto URI). Workers attempt pending delivery with retry. Inbox always remains authoritative. Delivery is best effort.

## Upgrade
Back up database; deploy commit SHA; startup migrates with `CREATE TABLE IF NOT EXISTS` currently (schema v1 only). Later schema changes require versioned migrations. One instance and disk mean maintenance windows may be needed.

## Limits
No external ILS, no SSO, no MARC, no email. For 2,000 concurrent users: measure before sizing, and migrate to multi-instance/Postgres if the single-writer design saturates.

## Consistent SQLite backup (R2)

Run `npm run backup -- /var/data/backups/lumen-YYYYMMDD.sqlite` from the service shell, with `LUMEN_DB_PATH` set. Uses Node's SQLite online backup API (WAL-consistent), opens the resulting image, runs PRAGMA integrity_check and writes a SHA-256 manifest next to the snapshot. **The backup must then be exported to separate storage with access control and tested restores**; a backup stored on the same disk is insufficient disaster recovery. Backup frequency, offsite copy and restore drills are currently operator obligations, not implemented automation.

Node 24's built-in SQLite API is at Release Candidate stability; do not claim enterprise DB maturity until verified for the chosen release.

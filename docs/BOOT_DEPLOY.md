# R7 boot-to-Render runbook and acceptance protocol

**Class:** standalone pilot. **Goal:** reproduce a usable LUMEN locally in GitHub Codespaces with one familiar command, then deploy the *same Git commit* as a Node service on Render. **Not:** production enterprise certification.

## A. Clean GitHub Codespace

1. Choose GitHub repository `Luke883i/lumen` → **Code → Codespaces → Create codespace** on the merged `main` branch.
2. The `.devcontainer/devcontainer.json` image includes Node 24 and npm. Its `postCreateCommand` runs `bash scripts/bootstrap.sh`, which checks Node/npm and performs `npm ci`. A legacy Codespace must be rebuilt; updating the repo alone does not replace its image.
3. Run exactly this in the Codespaces terminal:

```bash
npm run dev
```

4. Open the forwarded port **3000**, keep port visibility **Private**. Demo logins are `student@lumen.local`, `faculty@lumen.local`, `librarian@lumen.local`, all password `Demo1234!`. Confirm all role-specific views and the catalogue. Never expose the demo database as an internet-facing production service.
5. Execute `npm run verify:boot` and `npm run verify:deploy`. The boot test spins up isolated temporary servers through the same npm commands, checks response/manifest/catalogue/auth/session and removes all temporary data. The deploy check inspects the repo's Blueprint and Node/devcontainer pins. These checks run in GitHub CI; the Codespaces image itself is also tested in a dedicated workflow.

**If npm is missing:** use **Codespaces: Rebuild Container** (full rebuild if required), then `bash scripts/doctor.sh` and retry the command. Do not try to treat `npm install` as a fix for a missing npm binary.

## B. Configure the Render Blueprint

1. Merge the reviewed R7 PR. In Render, create a **New → Blueprint**, connect GitHub to `Luke883i/lumen`, and choose `main` and the repository-root `render.yaml`.
2. The Blueprint describes one paid Node Starter instance, Frankfurt region, a 1 GB disk `/var/data`, health check `/api/health`, build `npm ci && npm run check && npm test`, start `npm start`, and auto-deploy only **after GitHub CI checks pass**. Render reads `.node-version` to use Node `24.21.0` (unless an account-level `NODE_VERSION` override takes precedence).
3. Supply the prompted secrets `ADMIN_EMAIL` (valid non-demo library administrator address) and `ADMIN_PASSWORD` (12+ characters). Do not configure `LUMEN_DEMO=1`. Blueprint sets `NODE_ENV=production`, `LUMEN_DEMO=0`, `LUMEN_DB_PATH=/var/data/lumen.sqlite`.
4. Approve the Blueprint creation and deployment in Render's UI. Render provisions external resources only through your connected account; repository code cannot certify that provisioning happened.
5. The Render build checks syntax and unit/HTTP tests; at runtime `npm start` **automatically executes** `prestart` (the production preflight). The persistent disk is only attached to the runtime instance, not build or pre-deploy; database checks therefore belong at runtime.
6. Once the service is **Live**, run from a checkout matching the intended deploy (replace the hostname):

```bash
EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://your-service.onrender.com
```

The read-only smoke checks HTTPS, health and DB connectivity, PWA manifest, home, and `/api/version`, requiring the SHA reported by Render to equal the expected commit. A mismatch is **FAIL**, not deployment success. If the Render Blueprint deploys `main` but your terminal is on a feature branch, switch to the actual deployed commit first. Render provides `RENDER_GIT_COMMIT` at runtime.

7. After PASS, open `https://<assigned-service>.onrender.com/api/health`. Expected HTTP 200 with `{"status":"ok","db":true}`. Open `/` and log in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`; confirm staff role. Create real student/faculty users and catalogue entries; no default demo credentials are valid.
8. Optionally configure VAPID push keys using Render secrets, then OIDC/Koha settings one feature at a time **only after each staging acceptance test**. Never commit OAuth secrets or administrator passwords.

## C. Acceptance gates

| Gate | Required executable evidence | Current implementation |
|---|---|---|
| C1 | Clean Codespaces image provides node/npm | Docker image workflow + doctor |
| C2 | `npm run dev` boots, PWA loads, demo patron logs in | `npm run verify:boot` |
| C3 | `npm start` enforces preflight automatically | npm `prestart` |
| C4 | Production refuses demo and requires administrator, persistent DB | `npm run preflight` and runtime bootstrap |
| C5 | Render Blueprint pins Node/runtime disk/build/health | `npm run verify:deploy` |
| C6 | Actual Render instance passes SHA-bound `verify:remote` and persisted state survives restart | **BLOCKED pending external Render deployment** |
| C7 | Backup exported offsite and restored successfully | **BLOCKED pending operator exercise** |
| C8 | Koha/IdP live interoperability with institutional lifecycle | **BLOCKED pending live system fixtures** |
| C9 | 2,000-user mixed-workload endurance, HA, accessibility/security | **BLOCKED pending production-equivalent test** |

## D. Operational limitations and recovery

- The disk forces a **single Render instance** and brief service interruption on deployments. It cannot be used for multi-instance HA; if G7-G9 require HA or higher write throughput, move the authoritative state to a managed shared datastore and retest.
- For the pilot, retain the secrets in Render's secret manager. The `ADMIN_*` environment values remain configured across restarts; do not unset them without validating your startup configuration.
- Before upgrades, run `npm run backup -- /var/data/backups/lumen-<date>.sqlite` from the service shell, export encrypted backups to separate storage, then test restoring into a staging environment. A copy on the same persistent disk is **not** disaster recovery.
- To rollback application code, use Render's Deploys page. Rolling back executable code does not roll back SQLite migrations. Schedule maintenance and recover from a separately verified DB snapshot if schema compatibility breaks.
- If Render reports build failure, inspect `npm ci`, check, or test output; if runtime startup fails, inspect JSON output of `prestart` to find the failing named check. Do not disable the check merely to obtain a green health endpoint.
- Existing Render services are not changed by a Git commit unless the service is configured to sync/deploy that repo; confirm the Blueprint configuration in Render after merging.

## E. Further semantic slices

**R8**: operator-executed live Render canary and evidence artifact bound to deployed Git SHA, persistent-state restart verification, secure offsite backup / timed restore proof.

**R9**: real Koha and institutional OIDC staging acceptance (patron, checkout, renewal, return confirmation, role mapping, revocation), with mismatch/timeout receipts.

**R10**: 2,000-user mixed read/write/notification workload on production-equivalent target, soak, resource saturation, failure injection and capacity decision. Migrate away from single-instance SQLite if required by measured throughput/HA.

**R11**: independent security/privacy/accessibility reviews, operational ownership/runbooks, incident response and formal enterprise ILS release gate. No automatic claim from green CI.

### Remote canary data boundary

`npm run verify:remote` performs GETs only and never sends user credentials. Use a public HTTPS origin without a path, query or embedded password. For deterministic CI, an isolated local HTTP fixture checks the expected-SHA comparator, but only a **real Render deployment** can satisfy gate C6. Confirm state persistence by adding a harmless test catalogue item as staff, restarting the service, and observing the same item (without exposing demo users or secrets).


### R10 extra recovery acceptance

The portable recovery evidence check is `npm run verify:recovery -- /path/to/backup.sqlite` using both snapshot and manifest. Verify the file after an approved offsite export and **before** staging restore; no production restore is done by this tool. RTO/RPO evidence and recovery of a live Render deployment are still BLOCKED. Full procedure: [R10_RECOVERY.md](R10_RECOVERY.md).

# LUMEN — minimal universal deployment contract (R14)

**Version baseline:** Git SHA `03aaaa39e68ac4c4e378c0ebd3c8fbb4f1da9e36`. This PR adds a portable contract **for single-instance Node/SQLite deployments**, not an enterprise multi-replica architecture.

## 1. Three layers of truth

1. **Application invariants** — Node.js 24, one LUMEN process, production mode, no demo data, valid TCP port, usable SQLite database path and role-safe first administrator bootstrap.
2. **Adapter topology** — Render Blueprint, generic Node 24 service, or OCI/Docker image. These are packaging alternatives, not separate product implementations. Koha, OIDC and VAPID are optional independently accepted integrations.
3. **External operational acceptance** — TLS reverse proxy, real durable mounted volume, backup export/restore, observability, restart proof and suitable load characteristics. A path string (even with `LUMEN_STORAGE_ROOT`) cannot prove a host filesystem is durable.

## 2. All and only required inputs

| Input / capability | First production startup | Existing valid database | Notes |
|---|---|---|---|
| Node.js 24 runtime, or OCI image that provides it | Required | Required | `node:sqlite`; npm installed for source deployment |
| `NODE_ENV=production` | Required to choose the production profile | Required | `NODE_ENV` is not a secret |
| `LUMEN_DB_PATH` | Required, absolute, non-memory SQLite filename | Same | Must point to a writable volume **that the operator knows is persistent** |
| Durable writable volume for SQLite and WAL | Required | Required | Single active owner; not inferred from syntax |
| `ADMIN_EMAIL` | Required | **Not required** | Valid non-demo email; first administrator only |
| `ADMIN_PASSWORD` | Required, 12+ characters | **Not required** | Supplied through host secret manager, never committed |
| `PORT` | Optional | Optional | Platform may set; defaults to 3000; range 1..65535 |
| `LUMEN_STORAGE_ROOT` | Optional guard | Optional guard | When present, DB must resolve below this volume root |
| `LUMEN_DEMO` | Must not be `1` | Must not be `1` | Existing demo databases are blocked at bootstrap |
| TLS ingress and valid Origin/Host | Required for real browser-based production use | Same | External infrastructure; direct HTTP local smoke is not TLS proof |
| Koha/OIDC/Web Push credentials | **Not necessary** for standalone | Optional | Only if operator enables those capabilities |
| Render-specific files / devcontainer | **Not required by runtime** | Not required | Required only by their respective deployment workflows |

**Single-writer constraint:** SQLite + local sessions/push/queue is not a drop-in shared datastore. Multiple replicas with distinct files **split data authority**; do not scale to multiple instances merely because the deployment adapter supports it.

## 3. Minimal deploy commands

### GitHub Codespaces (development preview)

Create a **new** Node 24 Codespace from `main`. Its post-create hook executes `npm ci`. In the terminal:

```bash
npm run dev
```

Use private forwarded port 3000 and built-in demo accounts. If npm is absent in a legacy Codespace, **Rebuild Container**. This does not need Render credentials or a database volume.

### Render — supported pilot adapter

1. Merge the reviewed PR; select **Render → New Blueprint**, connect `Luke883i/lumen`, branch `main`, repository-root `render.yaml`.
2. Provide `ADMIN_EMAIL` and `ADMIN_PASSWORD` via Render environment/secrets. The Blueprint sets `NODE_ENV=production`, `LUMEN_DEMO=0`, `LUMEN_DB_PATH=/var/data/lumen.sqlite`, `LUMEN_STORAGE_ROOT=/var/data`, Node 24, paid Starter and a 1 GB disk.
3. Render builds with `npm ci && npm run check && npm test` and starts with `npm start`, which invokes the production preflight at runtime. **Do not move the SQLite migration into Render preDeploy**: persistent disks are unavailable there.
4. After **Live**, verify deployed SHA:
   
   ```bash
   EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://YOUR-SERVICE.onrender.com
   ```

5. Verify a harmless record survives service restart, export a backup off the instance and test an isolated restore. A Render disk is single-instance and prevents zero-downtime deploys. It does **not** satisfy HA or 2,000 concurrent user certification.

### Generic Node 24 host

Build: `npm ci`. Export production env vars (including absolute path to durable mounted volume, first-start administrator and port if needed), then `npm start`. The service listens on `0.0.0.0:$PORT`. Supply TLS at the host reverse proxy/load balancer. A later restart need not re-supply first-bootstrap credentials after an active user exists.

### OCI container (Docker/Podman-compatible host)

```bash
docker build -t lumen:local .
docker volume create lumen-data
docker run --name lumen --env-file ./secrets.env -p 3000:3000 \
  -v lumen-data:/data lumen:local
```

The **operator-created**, git-ignored `./secrets.env` must contain `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first startup. The image sets Node 24, production mode, `LUMEN_DB_PATH=/data/lumen.sqlite` and `LUMEN_STORAGE_ROOT=/data`. Retain the named volume when replacing the container; ensure the service is not publicly exposed without an HTTPS reverse proxy.

This is one OCI replica and one SQLite volume; Kubernetes requires a ReadWriteOnce volume mounted by one active pod, no overlapping leaders.

## 4. Ten thousand deterministic semantic mutations

```bash
npm run deploy:mutations
```

- Fixed seed `20261018`; exactly **10,000** configuration cases, eight topologies: Render, OCI, Railway-like storage, Fly-style volume, VM/systemd, bare metal, single-pod Kubernetes, generic Node PaaS.
- Variables: Node major, prod/development, port, absolute/relative/memory database path, volume root, bootstrap admin credentials, demo toggle, fresh/existing DB, incidental platform env.
- An independent decision oracle checks exact failure codes. Any mismatch exits nonzero and fails `npm test`; the JSON output contains PASS/FAIL distribution, per-gate rejections, platform coverage and deterministic SHA-256.
- **Epistemic limitation:** simulated configurations are **not 10,000 real deployments** and do not exercise 10,000 concurrent users, provider resource exhaustion, HA or real cloud volume recovery.

## 5. Two-process runtime falsification

```bash
npm run verify:portable
```

The script starts real `npm start` on an isolated path not under `/var/data` or `/mnt`, creates the first administrator, validates health/role/PWA, stops, then starts **the same DB without admin secrets** and repeats authentication. Output is SHA-bound machine-readable PASS/FAIL. The HTTPS Origin header in this local test models a TLS-terminated proxy; **it does not prove real TLS**.

Other gates: `npm run verify:boot` (development/standalone), `npm run verify:deploy` (Render static blueprint), `npm run verify:remote -- https://...` (real public host, exact Git SHA), `npm run verify:recovery -- BACKUP` (offline snapshot).

## 6. Definition of Done

| Layer | Gate | Source of evidence |
|---|---|---|
| Local | No hardcoded platform paths, strict port/Node/demo/first-admin, no `:memory:` production | `src/deployment-contract.mjs`, direct-server guard |
| Local | 10,000 seeded config variants with independent oracle and JSON audit | `npm run deploy:mutations`, Node test |
| Intermediate | Real first-start and credential-free restart, persistent SQLite | `npm run verify:portable` in CI |
| Intermediate | Native Render adapter + OCI build contract | `render.yaml`, `Dockerfile` |
| Global/source | Current main branch syntax/domain/browser/security checks remain green | GitHub Actions at final commit SHA |
| External | Real Render Live/canary, disk survives restart, offsite backup and restore | **BLOCKED** pending operator deployment evidence |
| Enterprise | Koha+IdP real acceptance, 2,000 concurrent mixed load, HA/DR, privacy/WCAG/security signoff | **BLOCKED** |

**Deployment lattice:** canonical Node+SQLite contract → one of {Codespaces preview, Render paid disk, native Node+volume, OCI+volume} → operational canary/restart/recovery → institution/service validation → target-scale hardening → release decision.

**Sources:** Render persistent disk and Blueprint contract: https://render.com/docs/disks and https://render.com/docs/blueprint-spec. Current module assumptions are versioned in this repository. No vendor-specific claims are inferred from passing config mutations.

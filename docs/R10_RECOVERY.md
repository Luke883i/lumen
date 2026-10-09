# R10 — Backup verification, isolated recovery rehearsal and Render evidence

## Goal and non-goal

For a *standalone single-instance LUMEN SQLite deployment*, determine whether an exported **complete** backup could be read as a valid database **before** an operator considers restoring it. The validation does not stop, modify or overwrite a live database. It does **not** deploy Render, schedule encrypted offsite retention or demonstrate RTO/RPO.

### Quick contract (Codespaces, staging, or authorized operator workstation)

After obtaining a backup plus its paired \`.manifest.json\` file in a private, access-controlled location:

\`\`\`bash
npm ci
npm run verify:recovery -- /path/to/backup.sqlite
\`\`\`

If the manifest has a different pathname:

\`\`\`bash
LUMEN_BACKUP_MANIFEST=/path/to/backup.manifest.json npm run verify:recovery -- /path/to/backup.sqlite
\`\`\`

Exit 0 and JSON \`status: PASS\` require all gates to pass; exit 1 + a fixed error code means failure. Do not parse logs for personally identifiable catalogue, patron or notification payloads; the tool returns only aggregate row counts and SHA/byte metadata.

### Producing a snapshot from the live Render disk

\`\`\`bash
npm run backup -- /var/data/backups/lumen-20261009-001.sqlite
\`\`\`

This action must be executed in the *running service's authorized environment*, where \`LUMEN_DB_PATH=/var/data/lumen.sqlite\` exists. The CLI uses SQLite online backup, allowing a consistent snapshot with WAL. The backup and its manifest are produced in the same destination directory. An existing destination is **not overwritten**: choose a new, collision-free filename.

**Move both files to independent, encrypted, access-controlled offsite storage** using a security-reviewed operator transfer process. Backups on the same Render disk are **not** disaster recovery. Render disks cannot be mounted by one-off build/predeploy jobs; a runtime or approved external data transfer workflow is required. The archive's full manifest contains a source basename and absolute destination pathname; treat it as operational data, not a public web response.

### Verification sequence

1. Reject missing or symbolic-link input; source and manifest must both be regular files.
2. Parse a bounded v1 manifest; require correct integer byte count and SHA-256 encoding.
3. Copy the file into an isolated OS temporary directory; verify copy length and SHA-256 against the manifest **without trusting live source files**.
4. Open **only the isolated copy** read-only; run SQLite \`integrity_check\`, \`foreign_key_check\`, and check mandatory LUMEN tables and important circulation uniqueness indexes.
5. Return bounded metadata and status; close the snapshot handle and remove the temporary directory in all normal success/failure paths.
6. Operator retains an immutable evidence record: \`{git SHA, backup SHA, completion time, PASS/FAIL/BLOCKED, archived location reference, reviewer}\`. This record is not automatically stored anywhere by the verifier.

### Matrix of adversarial claims

| Case | Expected |
|---|---|
| Post-backup mutation of source DB | PASS on independently captured snapshot; live source remains different |
| Snapshot byte addition/truncation | FAIL byte count |
| Manifest hash forged without matching bytes | FAIL SHA |
| Manifest invalid JSON, unsupported version | FAIL contract |
| Valid SQLite of unrelated application | FAIL LUMEN schema |
| Broken foreign keys in otherwise valid SQLite | FAIL relational integrity |
| Missing snapshot/manifest or symlink | FAIL |
| Second backup uses the same destination | FAIL, earlier backup and manifest unchanged |

**Trust limitation:** an unkeyed SHA-256 manifest is an *integrity checksum*, **not a cryptographic signature of who produced the backup**. An attacker able to replace both the backup and manifest can create a matching SHA. Offsite storage immutability, access restriction and optional signed/timestamped evidence require independent operator controls.

### Manual disaster recovery acceptance on Render (still BLOCKED)

- Record live commit using \`EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://<service>.onrender.com\`.
- Take a backup, export to approved independent store, copy to isolated staging with the **same deploy revision**; run \`npm run verify:recovery\`.
- Restore only to a **staging** instance; confirm accounts, seeded sentinel book/hold and critical circulation invariants; restart and verify persisted state, HTTP health and authenticated role access.
- Time detection, export, retrieval, restore and recovery, agree RPO/RTO and evidence owners with the institution.
- Test negative cases: missing storage credentials, incompatible schema on code rollback, corrupted manifest, unavailable disk; document an explicit fallback.
- Only after a signed staging acceptance should a real production recovery be authorized. Rollback of code alone **does not** reverse SQLite migrations.

### DoD classification

| Level | Required evidence | Status |
|---|---|---|
| Local | parser, bytes, SHA, integrity, foreign keys, schema, path boundaries | GitHub unit tests |
| Intermediate | isolated copy/no write to live DB, CLI, overwrite refusal | GitHub unit tests |
| Global CI | \`npm ci\`, checks, domain/HTTP, Codespaces boot and Chromium | Must pass on exact SHA |
| Global operator | real Render deployment, restart, encrypted offsite retrieval, timed staging restore | BLOCKED |
| Enterprise | Koha + IdP live, 2,000 mixed concurrent and HA/DR/security/accessibility signoff | BLOCKED |

References: [NIST SP 800-34r1](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final), [Render disk behavior](https://render.com/docs/disks), [LUMEN 21-PR audit](PR_01_21_MULTIDISCIPLINARY_AUDIT.md).

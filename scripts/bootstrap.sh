#!/usr/bin/env bash
set -euo pipefail
bash scripts/doctor.sh
if test -f package-lock.json; then
  npm ci
else
  npm install
fi
npm run check
printf 'LUMEN Codespace bootstrap complete. Run: npm run dev\n'

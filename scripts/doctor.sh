#!/usr/bin/env bash
set -euo pipefail
printf 'LUMEN environment check\n'
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf 'ERROR: Node.js/npm missing from this Codespace.\n' >&2
  printf 'Open VS Code Command Palette (Ctrl+Shift+P) and choose Codespaces: Rebuild Container.\n' >&2
  printf 'For a Codespace created before the devcontainer config: choose Full Rebuild.\n' >&2
  exit 127
fi
node --version
npm --version
node -e 'const n=Number(process.versions.node.split(".")[0]);if(n!==24){console.error("LUMEN expects Node 24 in Codespaces (found "+process.version+")");process.exit(2)}'
printf 'OK: Node and npm are available.\n'

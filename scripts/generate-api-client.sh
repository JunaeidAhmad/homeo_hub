#!/usr/bin/env bash
# Regenerate the OpenAPI schema from the Django API and the TypeScript types
# the web app's client is built on. Commit both outputs.
#
#   ./scripts/generate-api-client.sh          # regenerate
#   ./scripts/generate-api-client.sh --check  # fail if the committed client is stale (CI)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-$ROOT/backend/.venv/bin/python}"
command -v "$PYTHON" >/dev/null || { echo "Python not found: $PYTHON (create backend/.venv or set PYTHON)" >&2; exit 1; }
SCHEMA="frontend/src/api/openapi.yaml"
TYPES="frontend/src/api/schema.d.ts"

cd "$ROOT/backend"
# Schema generation needs no database; the local settings are enough.
DJANGO_SETTINGS_MODULE=config.settings.local \
  "$PYTHON" manage.py spectacular --file "$ROOT/$SCHEMA" --validate --fail-on-warn

cd "$ROOT/frontend"
npx --no-install openapi-typescript "$ROOT/$SCHEMA" -o "$ROOT/$TYPES" >/dev/null

if [ "${1:-}" = "--check" ]; then
  cd "$ROOT"
  # --porcelain also catches deleted or untracked outputs, not just modified ones.
  if [ -n "$(git status --porcelain -- "$SCHEMA" "$TYPES")" ]; then
    git --no-pager diff -- "$SCHEMA" "$TYPES"
    echo "API client is out of date: run ./scripts/generate-api-client.sh and commit the result." >&2
    exit 1
  fi
  echo "API client is up to date."
fi

#!/usr/bin/env bash
# One-time local setup: native Postgres 16 + Redis, Python 3.12 venv, npm (Node 24).
# Safe to re-run. Reads backend/.env (created from .env.example on first run).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f backend/.env ] || { cp backend/.env.example backend/.env; echo "Created backend/.env — set the Postgres password in DATABASE_URL, then re-run."; exit 1; }
[ -f frontend/.env.local ] || cp frontend/.env.example frontend/.env.local

# Database + role from DATABASE_URL, created as the postgres superuser via sudo
# when missing (skip with SKIP_DB_CREATE=1). An existing role is never altered:
# its password must already match the one in DATABASE_URL.
DATABASE_URL="$(grep -E '^DATABASE_URL=' backend/.env | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"]$//")"
mapfile -t DB_PARTS < <(python3 - "$DATABASE_URL" <<'PY'
import sys
from urllib.parse import unquote, urlparse
u = urlparse(sys.argv[1])
print(unquote(u.username or ""))
print(unquote(u.password or ""))
print(u.path.lstrip("/"))
PY
)
DB_USER="${DB_PARTS[0]}"; DB_PASS="${DB_PARTS[1]}"; DB_NAME="${DB_PARTS[2]}"
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || { echo "DATABASE_URL in backend/.env needs a user and a database name."; exit 1; }

if [ -z "${SKIP_DB_CREATE:-}" ]; then
  # psql variables (:'name') quote values safely; \gexec runs the generated statement.
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -v db_user="$DB_USER" -v db_pass="$DB_PASS" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L CREATEDB', :'db_user', :'db_pass')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user') \gexec
SQL
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -v db_user="$DB_USER" -v db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name') \gexec
SQL
fi

psql "$DATABASE_URL" -qAtc 'SELECT 1' >/dev/null \
  || { echo "Cannot connect with DATABASE_URL from backend/.env — check the password."; exit 1; }

redis-cli ping >/dev/null || { echo "Redis is not answering on localhost:6379 (sudo systemctl start redis-server)"; exit 1; }

[ -d backend/.venv ] || python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -q --upgrade pip
backend/.venv/bin/pip install -q -r backend/requirements-dev.txt
(cd backend && .venv/bin/python manage.py migrate && .venv/bin/python manage.py seed_locations && .venv/bin/python manage.py seed_roles)

npm install
(cd frontend && npm install)

echo "Setup done. Start everything with: npm run dev"

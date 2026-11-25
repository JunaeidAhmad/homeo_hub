# HomeoHub

Homeopathy care platform for Bangladesh: self care (illness → ranked remedies → order) and
doctor consultations. Design documents live in [`docs/`](docs/).

| Folder | What | Runs with | Deploys to |
|---|---|---|---|
| [`backend/`](backend/) | Django 5.2 + DRF API, served under `/api/v1/` | Python 3.12 virtualenv | Render (`render.yaml`) |
| [`frontend/`](frontend/) | Next.js (App Router, TypeScript) web app | npm, Node 24 | Vercel |
| [`docs/`](docs/) | Architecture, system design, ERD, data dictionary | — | — |

No Docker: everything runs natively against the Postgres 16 and Redis installed on your machine.

## Databases

- **Local** — native Postgres 16, database `homeohub` on `localhost:5432`. Used by `npm run dev` and by the tests
  (pytest creates and drops `test_homeohub`; tests never touch Neon).
- **Neon** — cloud Postgres used by the deployed API (`DATABASE_URL` on Render). From your machine, set
  `NEON_DATABASE_URL` in `backend/.env` and prefix a command with `USE_NEON=true` to run it against Neon:

  ```bash
  cd backend && USE_NEON=true .venv/bin/python manage.py migrate
  ```

## One-time setup

Prerequisites: Python 3.12, Node 24, Postgres 16 and Redis running locally (`systemctl status postgresql redis-server`).

```bash
cp backend/.env.example backend/.env   # then set the Postgres password in DATABASE_URL
./scripts/setup-local.sh               # creates the DB/user if missing, venv, npm installs, migrations
```

`setup-local.sh` creates the database role and database with `sudo -u postgres`; if they already exist, run it
with `SKIP_DB_CREATE=1`. Every backend variable is documented in [`backend/.env.example`](backend/.env.example);
the web app's in [`frontend/.env.example`](frontend/.env.example).

## Start

```bash
npm run dev
```

Starts the API on http://localhost:8000 and the web app on http://localhost:3000. The home page shows the API's
readiness (Postgres + Redis) fetched through the generated client.

- Health: `GET /api/v1/health/live` (process up) and `GET /api/v1/health/ready` (Postgres and Redis answer; 503 if not)
- OpenAPI schema: `GET /api/v1/schema/`

## Test, lint, type-check

```bash
npm test          # pytest (local Postgres) + Vitest
npm run lint      # ruff + eslint
npm run typecheck # mypy + tsc
```

## API client

The web app talks to the API through `openapi-fetch`, typed by `frontend/src/api/schema.d.ts`, which is generated
from the API's OpenAPI schema. After changing any API view or serializer:

```bash
npm run api:generate   # writes frontend/src/api/openapi.yaml and schema.d.ts — commit both
```

CI (`api-client` workflow) fails if the committed client is out of date.

## Lists and keyword search

Every list endpoint follows one convention (`backend/common/search.py`, `common/pagination.py`):

```
GET /api/v1/<things>/?q=&page=&page_size=&ordering=&<filters>
```

- `q`: keyword search over the view's `search_fields` with PostgreSQL full-text plus trigram matching, so typos,
  half-typed words, Bangla and English all work. Results come best match first unless `ordering` is given.
- `page` / `page_size`: 20 per page by default, at most 100. `ordering`: a field name, `-` for descending.
- Bangla text is compared in one Unicode form (NFC), so differently typed letters such as য় still match.

- Older English spellings (Comilla, Barisal, Jessore, Bogra, Chittagong) find the renamed areas, both in `q` and
  in the filters (`backend/apps/locations/spellings.py`).
- Anonymous requests are rate-limited per visitor (`THROTTLE_PUBLIC_READ`, default `300/min`). If Redis is down,
  public reads keep working.
- Search has no index yet; see the measured limits at the top of `common/search.py`.

A new list view only declares `search_fields`, `ordering_fields` and (optionally) a `filterset_class`.
In the web app use `useListQuery` + `SearchableTable` for admin lists and `LocationPicker` for choosing an area.

**Area list:** `python manage.py seed_locations` loads Bangladesh's 8 divisions, 64 districts and 495 upazilas
(names from [nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode), MIT, see
`backend/apps/locations/data/NOTICE.md`). It is safe to repeat; setup and every deploy run it.

## Languages (Bangla + English)

- **Web:** pages live under a hidden `[lang]` segment so both languages prerender statically, but visitors see
  clean URLs (`/`, `/doctor`, `/admin`). `frontend/src/proxy.ts` picks the language from the `hh_lang` cookie (the
  remembered choice), then the browser's `Accept-Language`, then English. The language switch sets the cookie and
  reloads. UI text lives in `frontend/src/i18n/messages/` (one catalog per area; Bangla must define every English key).
- **API:** every web request carries `Accept-Language` (`createApiClient` requires a `language`). Django resolves
  `bn` / `en` and answers with `Content-Language`. Translatable model fields come in `<field>_en` / `<field>_bn`
  pairs; read them with `common.i18n.localized_text(obj, "field")`, which falls back to English when Bangla is empty.
- **Areas:** patient (`/`), doctor (`/doctor`) and admin (`/admin`) are code-split by route. A lint rule stops one area
  importing another, so a patient page never loads doctor or admin code; share code through `src/components` or `src/lib`.
- **Mobile first:** write styles for a 390px phone, then add wide-screen rules with the `desktop:` variant (900px+).

## Settings

`backend/config/settings/` has `base`, `local` (default for `manage.py`), `test` (pytest), `staging` and
`production` (default for WSGI/ASGI). Staging and production refuse to start unless `SECRET_KEY`, `DATABASE_URL`,
`REDIS_URL`, `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` are set.

## CI

GitHub Actions, each workflow runs only when its folder changes:

- `backend` — ruff, mypy, migration check, pytest against Postgres 16 and Redis started directly on the runner
- `frontend` — eslint, tsc, Vitest, `next build`
- `api-client` — regenerates the schema and client and fails on any difference

## Deploy

- **API → Render**: blueprint in [`render.yaml`](render.yaml). Set `DATABASE_URL` (Neon), `REDIS_URL`
  (Render Key Value) and `CORS_ALLOWED_ORIGINS` (the Vercel domain) in the dashboard.
- **Check `NUM_PROXIES` after the first deploy.** Rate limits identify visitors from `X-Forwarded-For`. Set
  `NUM_PROXIES` to the number of proxies in front of the API once you have seen what Render sends; unset, the whole
  header is used (visitors are told apart, but a client calling the API directly could fake it).
- **Web → Vercel**: import the repo with Root Directory `frontend`; set `NEXT_PUBLIC_API_BASE_URL` to the Render URL.

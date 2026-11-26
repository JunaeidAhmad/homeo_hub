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

## Patient accounts and sign-in

- Phone numbers are stored as `+8801XXXXXXXXX`; any common way of typing them (including Bangla digits) works.
- Sign-up creates an unverified account and texts a 6-digit code (5 minutes, 5 tries). Verifying it signs in.
  A number can be texted 3 times in 15 minutes; a verification lasts at most 30 minutes however often it is resent.
  Sign-in allows 5 tries a minute per number and 30 per address.
- **In development the code is printed in the API log** (`SMS to +880...: HomeoHub code: 123456`).
- Access tokens last 15 minutes and are kept only in memory. The refresh token (30 days, replaced on every use) is an
  httpOnly, `SameSite=Strict` cookie; replaying a used one ends the session. Cookie endpoints require `X-Client: web`.
- The browser calls `/api/v1/...` **on the web app's own address**; `frontend/src/proxy.ts` forwards it to
  `API_BASE_URL`. This keeps the cookie first-party although the web app and API are on different sites.
- Only JSON request bodies are accepted, and endpoints that set or use the cookie require `X-Client: web`, so another
  website cannot sign a visitor in or out.
- Patients have their own table (`apps/patients`), separate from staff users. Gate patient actions with
  `IsPatient` or `IsVerifiedPatient`. Errors are `{"error": {"code", "message", "details", "request_id"}}`.

## Staff accounts and roles

Staff sign in at `/admin` with a username and password. Create the first super admin from the API's machine
(it asks for the password); prefix with `USE_NEON=true` to create it in Neon:

```bash
cd backend && .venv/bin/python manage.py create_staff yourname --name "Your Name"
```

- Roles are Django groups; what each may do is the table in `backend/apps/staff/roles.py`.
  `manage.py seed_roles` applies it (setup and every deploy run it). A super admin creates staff, changes
  roles and deactivates accounts at `/admin/staff`.
- Every view under `/api/v1/admin/` extends `AdminView` and declares `required_permissions` per method; anything
  undeclared is refused. The admin menu hides sections from roles without them, but the API is what enforces it.
- A staff session ends 12 hours after sign-in. Staff and patients have separate cookies. Staff also enter a
  code from an authenticator app (`STAFF_TOTP_REQUIRED`).

## Remedies and pictures

Staff with the *remedy manager* role (or admin) maintain remedies at `/admin/remedies`: Latin name, English text
(required), Bangla text (optional, English shows while empty), picture and status. Only **active** remedies appear
at `/remedies` and `/remedies/<address>`.

Pictures (JPEG, PNG or WebP, up to 5 MB) are checked by content, resized to at most 1200 px and stored as WebP.
In development they go to `backend/media/`. Deployed, they go to an S3-compatible bucket: set `STORAGE_BUCKET`
and the other `STORAGE_*` variables in [`backend/.env.example`](backend/.env.example). Until a bucket is set,
a deployed server refuses uploads (its disk is wiped on every deploy).

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
`production` (default for WSGI/ASGI). Staging and production refuse to start unless `SECRET_KEY` (at least 32
characters), `DATABASE_URL`, `REDIS_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` and `PROXY_SHARED_SECRET`
are set.

## CI

GitHub Actions, each workflow runs only when its folder changes:

- `backend` — ruff, mypy, migration check, pytest against Postgres 16 and Redis started directly on the runner
- `frontend` — eslint, tsc, Vitest, `next build`
- `api-client` — regenerates the schema and client and fails on any difference

## Deploy

Deploy the API first, then the web app. Each needs the other's address, so choose the Vercel project name up front.

### 1. API on Render

In Render: **New → Blueprint**, pick this repository. [`render.yaml`](render.yaml) creates the API (`homeohub-api`)
and a Key Value instance (Redis), both free plan, in Singapore next to the Neon database. When asked:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `CORS_ALLOWED_ORIGINS` | the web app's address, e.g. `https://homeohub.vercel.app` (**required**, no trailing slash) |
| `SMS_PROVIDER` | see "Before real users" below |
| `STORAGE_*` | an S3-compatible bucket; leave empty to refuse uploads for now |
| `WEBPUSH_*` | leave empty to turn push notifications off |

`SECRET_KEY` and `PROXY_SHARED_SECRET` are generated, `REDIS_URL` comes from the Key Value instance. Render runs
[`backend/build.sh`](backend/build.sh) on every deploy: it installs dependencies, collects static files, runs
migrations and loads the area list and staff roles. Check `https://<api>/api/v1/health/ready` afterwards.

Create the first staff account from your machine:
`cd backend && USE_NEON=true .venv/bin/python manage.py create_staff yourname --name "Your Name"`.

### 2. Web app on Vercel

**Add New → Project**, import this repository, set **Root Directory** to `frontend` (framework: Next.js), and add:

| Variable | Value |
|---|---|
| `API_BASE_URL` | the Render address, e.g. `https://homeohub-api.onrender.com` (the build fails without it) |
| `PROXY_SHARED_SECRET` | the value Render generated |

If the web app's address differs from what you gave Render, update `CORS_ALLOWED_ORIGINS` there and redeploy.

### Before real users

- **Text messages are not set up.** Sign-up and password reset answer "texts cannot be sent" until `SMS_PROVIDER`
  names a gateway class (the real gateway still has to be written). `apps.accounts.sms.ConsoleSmsProvider` prints
  codes to the server log: only for a private demo.
- **Online payment is a test page.** With the mock gateway anyone can mark their own payment successful.
- **Uploads need a bucket** (remedy pictures, doctor certificates, answer photos): a deployed server's disk is wiped.
- **Stuck online payments** are settled by hand: `python manage.py reconcile_payments` (no scheduler).
- **Rate limits need the visitor's address.** `PROXY_SHARED_SECRET` must match on both sides: the web app then
  tells the API which visitor each forwarded request is for (from `X-Forwarded-For`, which Vercel sets itself; do
  not put the web app behind a host that passes a browser's own value through). Other callers are identified by the
  address added by the last `NUM_PROXIES` proxies; check that value against what Render sends.

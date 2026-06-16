# Railway deployment & template

Deploy [Comp AI](https://github.com/trycompai/comp) on [Railway](https://railway.com) as a multi-service project, then publish it as a **Community template** from the Railway dashboard.

Railway does not run `docker-compose.yml` directly — each Compose service becomes its own Railway service. See the [Docker Compose guide](https://docs.railway.com/guides/docker-compose).

## Architecture

| Service | Dockerfile | Public? | Notes |
|---------|-----------|---------|-------|
| **Postgres** | Railway managed | No | Auto-provisioned |
| **Migrator** | `deploy/railway/Dockerfile.migrator` | No | Run once before first deploy |
| **API** | `apps/api/Dockerfile.multistage` | Yes | Auth + business logic (`/v1/health`) |
| **App** | `deploy/railway/Dockerfile.app` | Yes | Main dashboard (`/api/health`) |
| **Portal** | `deploy/railway/Dockerfile.portal` | Yes | Employee portal |
| **Storage** | Railway managed bucket | No | S3-compatible file storage |

> Railway [does not support Docker `--target`](https://station.railway.com/questions/how-can-i-specific-target-for-dockerfile-24307849). Each service has its own Dockerfile where the **last stage** is the production image.

## Storage (Railway Buckets)

`railway config apply` provisions a **Storage** bucket (`iad` region) and wires these variables into API, App, and Portal via [variable references](https://docs.railway.com/storage-buckets):

| Railway bucket var | Comp AI var | Notes |
|--------------------|-------------|-------|
| `ACCESS_KEY_ID` | `APP_AWS_ACCESS_KEY_ID` | Auto-injected |
| `SECRET_ACCESS_KEY` | `APP_AWS_SECRET_ACCESS_KEY` | Auto-injected |
| `REGION` | `APP_AWS_REGION` | Typically `auto` |
| `ENDPOINT` | `APP_AWS_ENDPOINT` | `https://storage.railway.app` |
| `BUCKET` | `APP_AWS_BUCKET_NAME` | S3 API bucket name |
| `BUCKET` | `APP_AWS_ORG_ASSETS_BUCKET` | Same bucket (key prefixes differ) |
| `BUCKET` | `APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET` | Same bucket |
| `BUCKET` | `APP_AWS_KNOWLEDGE_BASE_BUCKET` | Same bucket |

Comp AI already supports custom endpoints — when `APP_AWS_ENDPOINT` is set, the S3 client enables `forcePathStyle` (required for Railway; see [storage guide](https://docs.railway.com/guides/storage-buckets-guide)).

### Browser uploads (CORS)

Presigned uploads from the App/Portal frontends require CORS on the bucket. After domains are live, run once (with bucket credentials from `railway bucket credentials`):

```bash
AWS_ACCESS_KEY_ID="..." \
AWS_SECRET_ACCESS_KEY="..." \
aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --endpoint-url https://storage.railway.app \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
      "AllowedOrigins": [
        "https://YOUR_APP_DOMAIN",
        "https://YOUR_PORTAL_DOMAIN"
      ],
      "MaxAgeSeconds": 3000
    }]
  }'
```

See [Uploading & Serving Files](https://docs.railway.com/storage-buckets/uploading-serving) for details.

### Trigger.dev

Deploy tasks from your machine, then copy **email** and **storage** env vars into the Trigger.dev project:

```
EMAIL_PROVIDER=brevo
BREVO_API_KEY=...
RESEND_FROM_SYSTEM=noreply@yourdomain.com
RESEND_FROM_DEFAULT=hello@yourdomain.com
APP_AWS_*  # same values as Railway API service
```

(`RESEND_FROM_*` names are used for all email providers — they are your verified sender addresses.)

## Email provider (Resend or Brevo)

Set on the **API** service (where mail is sent):

| Variable | When |
|----------|------|
| `EMAIL_PROVIDER=resend` | Default |
| `EMAIL_PROVIDER=brevo` | Use [Brevo](https://www.brevo.com) transactional API |
| `RESEND_API_KEY` | Required if provider is `resend` |
| `BREVO_API_KEY` | Required if provider is `brevo` |
| `RESEND_FROM_SYSTEM` / `RESEND_FROM_DEFAULT` | Verified sender addresses (both providers) |


## Quick start (CLI)

### 1. Prerequisites

- [Railway CLI](https://docs.railway.com/develop/cli) installed and logged in (`railway --version` ≥ 5.x)
- [Railway TypeScript SDK](https://github.com/railwayapp/railway-ts-sdk) installed in this repo (required for `railway config plan` / `apply`)
- GitHub repo connected to Railway
- External accounts: [Resend](https://resend.com) or [Brevo](https://www.brevo.com), [Trigger.dev](https://cloud.trigger.dev)

Railway **Storage Buckets** (S3-compatible) are provisioned automatically via `.railway/railway.ts` — no separate AWS account required.

Install the SDK from the repo root:

```bash
bun install   # installs the `railway` devDependency (provides `railway/iac` + `railway-iac-ts`)
```

If you see *"Could not find Railway configuration support"* or *"Cannot find module 'railway/iac'"*, run `bun install` here — not in a subfolder.

> **Use a new Railway project** for Comp AI. `railway link` to an empty project (or create one in the dashboard). Do **not** `config apply` against an existing project with other services — the plan will try to delete everything not defined in `.railway/railway.ts`.

### 2. Provision infrastructure

```bash
railway login
railway link          # link to a **new** Comp AI project (not an existing app)
railway config plan   # preview .railway/railway.ts changes
railway config apply  # create Postgres + services
```

### 3. Configure each service (required for correct Dockerfiles)

Without a per-service config, Railway builds the **repo-root `Dockerfile`** (last stage = Portal) for every service — API will fail its `/v1/health` check.

**Option A — CLI (recommended):**

```bash
chmod +x deploy/railway/configure-build.sh deploy/railway/up-service.sh
./deploy/railway/configure-build.sh   # sets RAILWAY_DOCKERFILE_PATH per service
./deploy/railway/up-service.sh Migrator
./deploy/railway/up-service.sh API
./deploy/railway/up-service.sh App
./deploy/railway/up-service.sh Portal
```

`configure-build.sh` sets `RAILWAY_DOCKERFILE_PATH` (Railway’s supported override). `up-service.sh` also copies the matching `*.railway.json` for healthcheck/watch settings.

**Option B — Dashboard (required for GitHub autodeploys):**

Set **Config file path** per service (absolute from repo root):

| Service | Config file |
|---------|-------------|
| API | `/deploy/railway/api.railway.json` |
| App | `/deploy/railway/app.railway.json` |
| Portal | `/deploy/railway/portal.railway.json` |
| Migrator | `/deploy/railway/migrator.railway.json` |

Leave **Root Directory** empty for all services.

### 4. Generate public domains

For **API**, **App**, and **Portal**:

1. Open service → **Settings** → **Networking** → **Generate Domain**
2. Copy the public URLs

Wire cross-service URLs (use Railway reference variables in the Variables tab):

```
# App runtime + build (NEXT_PUBLIC_* are Docker build args)
NEXT_PUBLIC_API_URL=https://${{API.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_BETTER_AUTH_URL=https://${{App.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_PORTAL_URL=https://${{Portal.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_AUTH_VIA_APP_PROXY=1
BETTER_AUTH_URL=https://${{App.RAILWAY_PUBLIC_DOMAIN}}

# Portal
NEXT_PUBLIC_API_URL=https://${{API.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_BETTER_AUTH_URL=https://${{Portal.RAILWAY_PUBLIC_DOMAIN}}
BETTER_AUTH_URL=https://${{Portal.RAILWAY_PUBLIC_DOMAIN}}

# API
BASE_URL=https://${{API.RAILWAY_PUBLIC_DOMAIN}}
BETTER_AUTH_URL=https://${{App.RAILWAY_PUBLIC_DOMAIN}}
AUTH_TRUSTED_ORIGINS=https://${{App.RAILWAY_PUBLIC_DOMAIN}},https://${{Portal.RAILWAY_PUBLIC_DOMAIN}},https://${{API.RAILWAY_PUBLIC_DOMAIN}}
```

### 5. Set secrets

**Automated (recommended):**

```bash
# 1. Add vendor keys (gitignored — never commit)
cp .env.secrets.example .env.secrets
# edit .env.secrets: BREVO_API_KEY, TRIGGER_SECRET_KEY, RESEND_FROM_*

# 2. From repo root, after config apply
./deploy/railway/set-variables.sh          # loads .env.secrets automatically
./deploy/railway/set-variables.sh --yes    # non-interactive
./deploy/railway/set-variables.sh --dry-run
```

The script loads `.env.secrets`, generates domains (API/App/Portal), wires `${{...}}` URL references, creates random auth tokens, and skips vendor vars already set on Railway.

**Manual** — generate with `openssl rand -base64 32`:

| Variable | Services | Purpose |
|----------|----------|---------|
| `SECRET_KEY` | API, App | Auth / encryption (≥16 chars) |
| `AUTH_SECRET` | App | Session signing |
| `BETTER_AUTH_SECRET` | Portal | Portal session signing |
| `REVALIDATION_SECRET` | App | ISR revalidation |
| `INTERNAL_API_TOKEN` | API, App, Portal | Must match across all three |
| `SERVICE_TOKEN_TRIGGER` | API, App | Trigger.dev → API |
| `SERVICE_TOKEN_PORTAL` | API | Portal → API |
| `RESEND_API_KEY` | API, App, Portal | Email (when `EMAIL_PROVIDER=resend`) |
| `BREVO_API_KEY` | API | Email (when `EMAIL_PROVIDER=brevo`) |
| `EMAIL_PROVIDER` | API | `resend` (default) or `brevo` |
| `TRIGGER_SECRET_KEY` | API, App | Background jobs |
| `UPSTASH_REDIS_REST_URL` | App, API (recommended) | Onboarding setup sessions, rate limits, API CORS cache |
| `UPSTASH_REDIS_REST_TOKEN` | App, API (recommended) | Pair with URL — Upstash Cloud **or** Railway [Serverless Redis](https://railway.com/deploy/hBFwO4) |
| `DATABASE_URL` | All | Reference `${{Postgres.DATABASE_URL}}` |

Full variable reference: `packages/docs/self-hosting/env-reference.mdx`

### 5b. Redis (Serverless Redis template on Railway)

Comp AI uses `@upstash/redis` (HTTP REST). Plain Railway Redis (`REDIS_URL`) does **not** work without code changes. Use the [Serverless Redis template](https://railway.com/deploy/hBFwO4) — Redis + an Upstash-compatible HTTP wrapper:

```bash
# From repo root, linked to your Comp AI project
railway deploy -t hBFwO4

# After deploy, confirm the http service is online and note SR_TOKEN:
railway variable list --service http --kv | rg 'SR_TOKEN|RAILWAY_PUBLIC_DOMAIN'

# Smoke test (replace token):
curl -sS -X POST "https://<http-domain>/pipeline" \
  -H "Authorization: Bearer <SR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '[["PING"]]'

# Wire App + API (reference vars — survive http service redeploys):
railway variable set \
  "UPSTASH_REDIS_REST_URL=https://\${{http.RAILWAY_PUBLIC_DOMAIN}}" \
  "UPSTASH_REDIS_REST_TOKEN=\${{http.SR_TOKEN}}" \
  --service App

railway variable set \
  "UPSTASH_REDIS_REST_URL=https://\${{http.RAILWAY_PUBLIC_DOMAIN}}" \
  "UPSTASH_REDIS_REST_TOKEN=\${{http.SR_TOKEN}}" \
  --service API

./deploy/railway/up-service.sh App
```

Alternatively use Upstash Cloud and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` from the Upstash console.

### 6. Run migrations

Deploy the **Migrator** service once (restart policy: `NEVER`). Check deploy logs for `prisma migrate deploy` success, then deploy API → App → Portal.

### 7. Deploy Trigger.dev tasks

Auth emails (magic link, OTP) and most background jobs enqueue **Trigger.dev** tasks from the **API** (`apps/api/src/trigger/`). Railway only triggers them — a worker must be deployed on Trigger.dev.

The repo defaults to Comp AI's internal project ref (`proj_zhioyrusqertqgafqgpj`). **Your account cannot deploy to it.** Create your own project:

1. [cloud.trigger.dev](https://cloud.trigger.dev) → **New project** (e.g. "Comp AI API")
2. Copy the **project ref** (`proj_…`) and **Production** secret key (`tr_prod_…`)
3. Set on Railway **API** (and **App** if it triggers tasks):

   ```bash
   railway variable set TRIGGER_SECRET_KEY=tr_prod_... --service API
   ```

4. In Trigger.dev → your project → **Environment variables** (Production), add:

   ```
   EMAIL_PROVIDER=brevo
   BREVO_API_KEY=...
   RESEND_FROM_SYSTEM=support@yourdomain.com
   RESEND_FROM_DEFAULT=support@yourdomain.com
   DATABASE_URL=...          # same Postgres as Railway
   PRISMA_ALLOW_INSECURE_TLS=1
   ```

5. Deploy the API task bundle (not `apps/app` — that is a separate Trigger project for app-only jobs):

   ```bash
   cd apps/api
   bunx trigger.dev@latest login
   export TRIGGER_PROJECT_REF=proj_YOUR_REF   # or pass -p proj_YOUR_REF
   bunx trigger.dev@latest deploy              # defaults to prod — matches tr_prod_ key
   ```

Until this step completes, magic-link requests return 200 but emails stay **QUEUED** on Trigger.dev.

## Publishing as a Railway template

Per [Railway's template program](https://github.com/railwayapp/templates):

1. **Deploy a working project** using the steps above (all services green, domains generated, secrets set).
2. In Railway dashboard → **Project Settings** → **Templates** → **Publish Template**.
3. The repo must be **public** on GitHub for community templates.
4. In the publish flow, configure:
   - Which services to include (Postgres, Storage, API, App, Portal, Migrator)
   - Required user-provided variables (`SECRET_KEY`, `RESEND_API_KEY`, `TRIGGER_SECRET_KEY`, etc.)
   - Whether to auto-attach generated domains
5. After approval, the template appears on [railway.com/templates](https://railway.com/templates) with the **Community** tag.

Templates are no longer submitted via the [railwayapp/templates](https://github.com/railwayapp/templates) GitHub repo — publishing happens entirely in the Railway UI.

## Build notes

- **Memory**: Next.js Docker builds use `NODE_OPTIONS=--max_old_space_size=6144` (6 GB). Use a Railway plan with sufficient build resources.
- **Next.js build runtime**: App/Portal builder stages use **Node** (not Bun) with `next build --webpack`. Next.js 16 defaults to Turbopack, which requires `worker_threads` options Bun does not implement in Docker.
- **Watch patterns**: Each `*.railway.json` limits deploy triggers to relevant paths. Root `package.json` and `bun.lock` are listed so lockfile changes redeploy the right services.
- **Root directory**: Leave **Root Directory** empty (repo root) for every service — not `apps/app` or `apps/portal`.
- **`bun.lock` must not be in `.gitignore`**: `railway up` respects `.gitignore` and will omit ignored files from the upload. If Docker fails with `"/bun.lock": not found`, remove `bun.lock` from `.gitignore` (do not rely on `railway up --no-gitignore` long-term).
- **OAuth**: Register redirect URIs against the **API** domain: `https://<api-domain>/api/auth/callback/google` (and Microsoft/GitHub equivalents).
- **Auth cookies on Railway**: Default `*.up.railway.app` domains cannot share cookies. Set `NEXT_PUBLIC_AUTH_VIA_APP_PROXY=1` on App (done by `set-variables.sh`) so `/api/auth/*` is proxied through the app and magic-link emails use `BETTER_AUTH_URL`. For production, prefer custom domains (`app.example.com` + `api.example.com`) with `AUTH_COOKIE_DOMAIN=.example.com` on the API.

## Files in this directory

```
deploy/railway/
├── Dockerfile.app        # Next.js app (standalone)
├── Dockerfile.portal     # Next.js portal (standalone)
├── Dockerfile.migrator   # Prisma migrate deploy (one-shot)
├── api.railway.json      # API service config
├── app.railway.json      # App service config
├── portal.railway.json   # Portal service config
├── migrator.railway.json # Migrator service config
└── README.md             # This file

.railway/railway.ts       # Multi-service IaC (CLI plan/apply)
```

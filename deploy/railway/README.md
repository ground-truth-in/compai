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

- [Railway CLI](https://docs.railway.com/develop/cli) installed and logged in
- GitHub repo connected to Railway
- External accounts: [Resend](https://resend.com), [Trigger.dev](https://cloud.trigger.dev)

Railway **Storage Buckets** (S3-compatible) are provisioned automatically via `.railway/railway.ts` — no separate AWS account required.

### 2. Provision infrastructure

```bash
railway link          # link to a new or existing project
railway config plan   # preview .railway/railway.ts changes
railway config apply  # create Postgres + services
```

### 3. Configure each service

In the Railway dashboard, set **Config file path** per service (absolute from repo root):

| Service | Config file |
|---------|-------------|
| API | `/deploy/railway/api.railway.json` |
| App | `/deploy/railway/app.railway.json` |
| Portal | `/deploy/railway/portal.railway.json` |
| Migrator | `/deploy/railway/migrator.railway.json` |

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

Generate with `openssl rand -base64 32`:

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
| `DATABASE_URL` | All | Reference `${{Postgres.DATABASE_URL}}` |

Full variable reference: `packages/docs/self-hosting/env-reference.mdx`

### 6. Run migrations

Deploy the **Migrator** service once (restart policy: `NEVER`). Check deploy logs for `prisma migrate deploy` success, then deploy API → App → Portal.

### 7. Deploy Trigger.dev tasks

Trigger.dev runs outside Railway:

```bash
cd apps/app
bunx trigger.dev@latest login
bunx trigger.dev@latest deploy
```

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
- **Watch patterns**: Each `*.railway.json` limits rebuilds to relevant paths.
- **OAuth**: Register redirect URIs against the **API** domain: `https://<api-domain>/api/auth/callback/google` (and Microsoft/GitHub equivalents).

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

#!/usr/bin/env bash
# Generate domains (if missing), cross-service URLs, and secrets for Comp AI on Railway.
#
# Prerequisites:
#   - railway CLI logged in and linked to your Comp AI project
#   - bun install at repo root (for railway IaC SDK)
#   - config apply already run (Postgres, Storage, services exist)
#
# Usage:
#   ./deploy/railway/set-variables.sh              # loads .env.secrets if present
#   ./deploy/railway/set-variables.sh --dry-run
#   ./deploy/railway/set-variables.sh --yes        # non-interactive (needs .env.secrets or env)
#   SECRETS_FILE=/path/to/secrets ./deploy/railway/set-variables.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SECRETS_FILE="${SECRETS_FILE:-$REPO_ROOT/.env.secrets}"

DRY_RUN=false
SKIP_DOMAINS=false
ASSUME_YES=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --skip-domains) SKIP_DOMAINS=true ;;
    --yes | -y) ASSUME_YES=true ;;
    -h | --help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI not found. Install: https://docs.railway.com/develop/cli" >&2
  exit 1
fi

if ! railway status >/dev/null 2>&1; then
  echo "Not linked to a Railway project. Run: railway init --name \"Comp AI\" or railway link" >&2
  exit 1
fi

if [[ -f "$SECRETS_FILE" ]]; then
  echo "Loading vendor secrets from $SECRETS_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
  echo ""
elif $ASSUME_YES; then
  echo "No secrets file at $SECRETS_FILE — pass vars via env or create the file." >&2
  exit 1
fi

rand() {
  openssl rand -base64 32
}

run() {
  if $DRY_RUN; then
    printf '  %s\n' "$*"
  else
    "$@"
  fi
}

set_service_vars() {
  local service="$1"
  shift
  if [[ $# -eq 0 ]]; then
    return 0
  fi
  run railway variable set "$@" --service "$service"
}

prompt_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local current="${!var_name:-}"
  if [[ -n "$current" ]]; then
    return 0
  fi
  if $ASSUME_YES; then
    echo "Missing $var_name (pass via env, set on Railway, or drop --yes)" >&2
    exit 1
  fi
  read -r -p "$prompt_text: " "$var_name"
  if [[ -z "${!var_name}" ]]; then
    echo "$var_name is required." >&2
    exit 1
  fi
}

railway_var_exists() {
  local service="$1"
  local key="$2"
  railway variable list --service "$service" --kv 2>/dev/null | grep -q "^${key}="
}

prompt_or_use_railway() {
  local service="$1"
  local var_name="$2"
  local prompt_text="$3"
  if [[ -n "${!var_name:-}" ]]; then
    return 0
  fi
  if railway_var_exists "$service" "$var_name"; then
    echo "  Using existing $var_name on $service (not overwriting)"
    return 0
  fi
  prompt_if_empty "$var_name" "$prompt_text"
}

echo "Comp AI — Railway variable setup"
echo "Project: $(railway status 2>/dev/null | head -1 || echo unknown)"
echo ""

if ! $SKIP_DOMAINS; then
  echo "Step 1/4: Public domains (skip with --skip-domains if already set)"
  for svc in API App Portal; do
    echo "  Ensuring domain for $svc..."
    if $DRY_RUN; then
      echo "    railway domain --service $svc"
    else
      railway domain --service "$svc" 2>/dev/null || true
    fi
  done
  echo ""
fi

echo "Step 2/4: Cross-service URLs (Railway reference variables)"
# shellcheck disable=SC2016
API_URL='https://${{API.RAILWAY_PUBLIC_DOMAIN}}'
# shellcheck disable=SC2016
APP_URL='https://${{App.RAILWAY_PUBLIC_DOMAIN}}'
# shellcheck disable=SC2016
PORTAL_URL='https://${{Portal.RAILWAY_PUBLIC_DOMAIN}}'
# shellcheck disable=SC2016
TRUSTED='https://${{App.RAILWAY_PUBLIC_DOMAIN}},https://${{Portal.RAILWAY_PUBLIC_DOMAIN}},https://${{API.RAILWAY_PUBLIC_DOMAIN}}'

set_service_vars API \
  "BASE_URL=$API_URL" \
  "BETTER_AUTH_URL=$APP_URL" \
  "AUTH_TRUSTED_ORIGINS=$TRUSTED" \
  "PORTAL_URL=$PORTAL_URL" \
  "TRUST_APP_URL=$PORTAL_URL" \
  "PRISMA_ALLOW_INSECURE_TLS=1" \
  'DATABASE_URL=${{Postgres.DATABASE_URL}}'

set_service_vars App \
  "NEXT_PUBLIC_API_URL=$API_URL" \
  "NEXT_PUBLIC_BETTER_AUTH_URL=$APP_URL" \
  "NEXT_PUBLIC_PORTAL_URL=$PORTAL_URL" \
  "BETTER_AUTH_URL=$APP_URL" \
  "PRISMA_ALLOW_INSECURE_TLS=1" \
  'DATABASE_URL=${{Postgres.DATABASE_URL}}'

set_service_vars Portal \
  "NEXT_PUBLIC_API_URL=$API_URL" \
  "NEXT_PUBLIC_BETTER_AUTH_URL=$PORTAL_URL" \
  "BETTER_AUTH_URL=$PORTAL_URL" \
  "PRISMA_ALLOW_INSECURE_TLS=1" \
  'DATABASE_URL=${{Postgres.DATABASE_URL}}'

set_service_vars Migrator \
  "PRISMA_ALLOW_INSECURE_TLS=1" \
  'DATABASE_URL=${{Postgres.DATABASE_URL}}'

echo ""

echo "Step 3/4: Secrets"
SECRET_KEY_API="$(rand)"
SECRET_KEY_APP="$(rand)"
AUTH_SECRET="$(rand)"
BETTER_AUTH_SECRET="$(rand)"
REVALIDATION_SECRET="$(rand)"
INTERNAL_API_TOKEN="$(rand)"
SERVICE_TOKEN_TRIGGER="$(rand)"
SERVICE_TOKEN_PORTAL="$(rand)"

prompt_or_use_railway API BREVO_API_KEY "Brevo API key (BREVO_API_KEY)"
prompt_or_use_railway API TRIGGER_SECRET_KEY "Trigger.dev secret (TRIGGER_SECRET_KEY)"
prompt_or_use_railway API RESEND_FROM_SYSTEM "Verified sender — system mail (RESEND_FROM_SYSTEM)"
prompt_or_use_railway API RESEND_FROM_DEFAULT "Verified sender — default mail (RESEND_FROM_DEFAULT)"

API_VARS=(
  "SECRET_KEY=$SECRET_KEY_API"
  "INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN"
  "SERVICE_TOKEN_TRIGGER=$SERVICE_TOKEN_TRIGGER"
  "SERVICE_TOKEN_PORTAL=$SERVICE_TOKEN_PORTAL"
  "EMAIL_PROVIDER=brevo"
  "MACED_API_KEY=${MACED_API_KEY:-mc_dev_dummy_api_key}"
)

if [[ -n "${BREVO_API_KEY:-}" ]]; then
  API_VARS+=("BREVO_API_KEY=$BREVO_API_KEY")
fi
if [[ -n "${TRIGGER_SECRET_KEY:-}" ]]; then
  API_VARS+=("TRIGGER_SECRET_KEY=$TRIGGER_SECRET_KEY")
fi
if [[ -n "${RESEND_FROM_SYSTEM:-}" ]]; then
  API_VARS+=("RESEND_FROM_SYSTEM=$RESEND_FROM_SYSTEM")
fi
if [[ -n "${RESEND_FROM_DEFAULT:-}" ]]; then
  API_VARS+=("RESEND_FROM_DEFAULT=$RESEND_FROM_DEFAULT")
fi

set_service_vars API "${API_VARS[@]}"

APP_VARS=(
  "SECRET_KEY=$SECRET_KEY_APP"
  "AUTH_SECRET=$AUTH_SECRET"
  "REVALIDATION_SECRET=$REVALIDATION_SECRET"
  "INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN"
  "SERVICE_TOKEN_TRIGGER=$SERVICE_TOKEN_TRIGGER"
)

if [[ -n "${TRIGGER_SECRET_KEY:-}" ]]; then
  APP_VARS+=("TRIGGER_SECRET_KEY=$TRIGGER_SECRET_KEY")
elif ! railway_var_exists App TRIGGER_SECRET_KEY && railway_var_exists API TRIGGER_SECRET_KEY; then
  echo "  Note: TRIGGER_SECRET_KEY is on API but not App — set the same value on App in the dashboard"
fi

set_service_vars App "${APP_VARS[@]}"

set_service_vars Portal \
  "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" \
  "INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN"

echo ""
echo "Step 4/4: Storage bucket references (APP_AWS_*)"
BUCKET_NAME="$(railway bucket list --json 2>/dev/null | bun -e "
  const rows = JSON.parse(await Bun.stdin.text());
  if (!Array.isArray(rows) || rows.length === 0) process.exit(1);
  console.log(rows[0].name);
" 2>/dev/null || true)"

if [[ -n "${BUCKET_NAME:-}" ]]; then
  echo "  Bucket service: $BUCKET_NAME"
  # shellcheck disable=SC2016
  BUCKET_VARS=(
    "APP_AWS_ACCESS_KEY_ID=\${{${BUCKET_NAME}.ACCESS_KEY_ID}}"
    "APP_AWS_SECRET_ACCESS_KEY=\${{${BUCKET_NAME}.SECRET_ACCESS_KEY}}"
    "APP_AWS_REGION=\${{${BUCKET_NAME}.REGION}}"
    "APP_AWS_ENDPOINT=\${{${BUCKET_NAME}.ENDPOINT}}"
    "APP_AWS_BUCKET_NAME=\${{${BUCKET_NAME}.BUCKET}}"
    "APP_AWS_ORG_ASSETS_BUCKET=\${{${BUCKET_NAME}.BUCKET}}"
    "APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET=\${{${BUCKET_NAME}.BUCKET}}"
    "APP_AWS_KNOWLEDGE_BASE_BUCKET=\${{${BUCKET_NAME}.BUCKET}}"
  )
  for svc in API App Portal; do
    set_service_vars "$svc" "${BUCKET_VARS[@]}"
  done
else
  echo "  No bucket found — skip or create one: railway bucket create <name> --region iad"
fi

echo ""
if $DRY_RUN; then
  echo "Dry run complete. Re-run without --dry-run to apply."
else
  echo "Done. Saved tokens for Trigger.dev (copy APP_AWS_* from API variables too):"
  echo "  INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN"
  echo "  SERVICE_TOKEN_TRIGGER=$SERVICE_TOKEN_TRIGGER"
  echo ""
  echo "Next:"
  echo "  1. ./deploy/railway/up-service.sh API    # uses api.railway.json (not root Dockerfile)"
  echo "  2. ./deploy/railway/up-service.sh App"
  echo "  3. ./deploy/railway/up-service.sh Portal"
  echo "  Or set config file paths in dashboard (see README) for GitHub autodeploys"
  echo "  4. cd apps/app && bunx trigger.dev@latest deploy"
fi

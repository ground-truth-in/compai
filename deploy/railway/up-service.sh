#!/usr/bin/env bash
# Deploy a Comp AI Railway service with the correct railway.json / Dockerfile.
#
# Railway CLI uploads the repo root. Without a per-service config file path in the
# dashboard, it defaults to the root Dockerfile (last stage = Portal). This script
# copies the service-specific *.railway.json to ./railway.json before `railway up`.
#
# Usage:
#   ./deploy/railway/up-service.sh API
#   ./deploy/railway/up-service.sh Portal --detach -y
#   ./deploy/railway/up-service.sh Migrator
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <API|App|Portal|Migrator> [railway up flags...]" >&2
  exit 1
fi

SERVICE="$1"
shift

case "$SERVICE" in
  API) CONFIG="$SCRIPT_DIR/api.railway.json" ;;
  App) CONFIG="$SCRIPT_DIR/app.railway.json" ;;
  Portal) CONFIG="$SCRIPT_DIR/portal.railway.json" ;;
  Migrator) CONFIG="$SCRIPT_DIR/migrator.railway.json" ;;
  *)
    echo "Unknown service: $SERVICE (use API, App, Portal, or Migrator)" >&2
    exit 1
    ;;
esac

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing config: $CONFIG" >&2
  exit 1
fi

cd "$REPO_ROOT"

if ! railway variable list --service "$SERVICE" --kv 2>/dev/null | grep -q '^RAILWAY_DOCKERFILE_PATH='; then
  case "$SERVICE" in
    API) DF=apps/api/Dockerfile.multistage ;;
    App) DF=deploy/railway/Dockerfile.app ;;
    Portal) DF=deploy/railway/Dockerfile.portal ;;
    Migrator) DF=deploy/railway/Dockerfile.migrator ;;
  esac
  echo "Setting RAILWAY_DOCKERFILE_PATH=$DF on $SERVICE"
  railway variable set "RAILWAY_DOCKERFILE_PATH=$DF" --service "$SERVICE"
  echo ""
fi

TMP_CONFIG="$REPO_ROOT/railway.json"
cleanup() {
  rm -f "$TMP_CONFIG"
}
trap cleanup EXIT

cp "$CONFIG" "$TMP_CONFIG"
echo "Using $CONFIG → railway.json for $SERVICE deploy"
echo ""

exec railway up --service "$SERVICE" "$@"

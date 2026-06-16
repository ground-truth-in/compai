#!/usr/bin/env bash
# Point each Railway service at the correct Dockerfile (fixes API building Portal).
#
# Railway stores dockerfilePath on the service instance (/Dockerfile by default).
# RAILWAY_DOCKERFILE_PATH is the supported override — works via CLI without dashboard.
#
# Usage:
#   ./deploy/railway/configure-build.sh
#   ./deploy/railway/configure-build.sh --dry-run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h | --help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

run() {
  if $DRY_RUN; then
    printf '  %s\n' "$*"
  else
    "$@"
  fi
}

echo "Setting RAILWAY_DOCKERFILE_PATH per service..."
echo ""

run railway variable set RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile.multistage --service API
run railway variable set RAILWAY_DOCKERFILE_PATH=deploy/railway/Dockerfile.app --service App
run railway variable set RAILWAY_DOCKERFILE_PATH=deploy/railway/Dockerfile.portal --service Portal
run railway variable set RAILWAY_DOCKERFILE_PATH=deploy/railway/Dockerfile.migrator --service Migrator

echo ""
if $DRY_RUN; then
  echo "Dry run complete."
else
  echo "Done. Redeploy:"
  echo "  ./deploy/railway/up-service.sh API"
  echo "  ./deploy/railway/up-service.sh App"
  echo "  ./deploy/railway/up-service.sh Portal"
fi

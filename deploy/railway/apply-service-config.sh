#!/usr/bin/env bash
# Show IaC plan for per-service configFile paths.
#
# WARNING: `railway config apply` on an existing project with manual variables
# will DELETE variables not listed in .railway/railway.ts. Prefer:
#   ./deploy/railway/up-service.sh <Service>
# or set config file paths in the Railway dashboard.
#
# Usage:
#   ./deploy/railway/apply-service-config.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "Railway IaC plan (.railway/railway.ts):"
echo ""
railway config plan --verbose 2>&1 || true
echo ""
echo "Recommended (no variable wipe):"
echo "  ./deploy/railway/up-service.sh API"
echo "  ./deploy/railway/up-service.sh App"
echo "  ./deploy/railway/up-service.sh Portal"
echo ""
echo "Dashboard alternative: set Config file path per service (see README §3)."

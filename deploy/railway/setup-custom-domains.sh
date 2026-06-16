#!/usr/bin/env bash
# Register ground-truth.in custom domains on Railway and wire auth for shared cookies.
#
# Prerequisites:
#   railway login   (domain API needs a fresh session)
#   railway link    (Comp AI project)
#
# Usage:
#   ./deploy/railway/setup-custom-domains.sh
#   DOMAIN=example.com ./deploy/railway/setup-custom-domains.sh
#   ./deploy/railway/setup-custom-domains.sh --skip-dns   # env + redeploy only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DOMAIN="${DOMAIN:-ground-truth.in}"
API_HOST="compai-api.${DOMAIN}"
APP_HOST="compai-app.${DOMAIN}"
PORTAL_HOST="compai-portal.${DOMAIN}"
COOKIE_DOMAIN=".${DOMAIN}"
SKIP_DNS=false

for arg in "$@"; do
  case "$arg" in
    --skip-dns) SKIP_DNS=true ;;
    -h | --help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: https://docs.railway.com/develop/cli" >&2
  exit 1
fi

if ! railway status >/dev/null 2>&1; then
  echo "Run: railway link" >&2
  exit 1
fi

echo "Comp AI custom domains — ${DOMAIN}"
echo ""

if ! $SKIP_DNS; then
  echo "Step 1/4: Register domains on Railway (copy CNAME targets into GoDaddy)"
  echo ""
  for svc_host in "API:${API_HOST}" "App:${APP_HOST}" "Portal:${PORTAL_HOST}"; do
    svc="${svc_host%%:*}"
    host="${svc_host#*:}"
    echo "── ${svc} → https://${host}"
    if ! railway domain "$host" --service "$svc" 2>&1; then
      echo ""
      echo "If you see Unauthorized, run: railway login" >&2
      echo "Then re-run this script." >&2
      exit 1
    fi
    echo ""
  done

  echo "GoDaddy DNS (My Products → ground-truth.in → DNS → Add):"
  echo "  For each host you need CNAME + TXT (_railway-verify.<host>) — see Railway dashboard or run:"
  echo "    railway domain ${API_HOST} --service API"
  echo "  TTL: 600 seconds (or default). Do not enable forwarding."
  echo ""
  read -r -p "Press Enter after DNS records are saved in GoDaddy (or Ctrl+C to abort)..."
  echo ""
fi

echo "Step 2/4: API auth + cookie domain"
railway variable set \
  "BASE_URL=https://${API_HOST}" \
  "AUTH_COOKIE_DOMAIN=${COOKIE_DOMAIN}" \
  "AUTH_TRUSTED_ORIGINS=https://${APP_HOST},https://${PORTAL_HOST},https://${API_HOST}" \
  "BETTER_AUTH_URL=https://${API_HOST}" \
  "PORTAL_URL=https://${PORTAL_HOST}" \
  "TRUST_APP_URL=https://${PORTAL_HOST}" \
  --service API

echo "Step 3/4: App + Portal"
railway variable set \
  "NEXT_PUBLIC_API_URL=https://${API_HOST}" \
  "NEXT_PUBLIC_BETTER_AUTH_URL=https://${API_HOST}" \
  "NEXT_PUBLIC_PORTAL_URL=https://${PORTAL_HOST}" \
  "BETTER_AUTH_URL=https://${APP_HOST}" \
  --service App

railway variable set \
  "NEXT_PUBLIC_API_URL=https://${API_HOST}" \
  "NEXT_PUBLIC_BETTER_AUTH_URL=https://${API_HOST}" \
  "BETTER_AUTH_URL=https://${PORTAL_HOST}" \
  --service Portal

echo "Step 4/4: Redeploy (NEXT_PUBLIC_* require rebuild)"
"$SCRIPT_DIR/up-service.sh" API
"$SCRIPT_DIR/up-service.sh" App
"$SCRIPT_DIR/up-service.sh" Portal

echo ""
echo "Done. After DNS propagates (~5–30 min):"
echo "  App:    https://${APP_HOST}"
echo "  API:    https://${API_HOST}"
echo "  Portal: https://${PORTAL_HOST}"
echo ""
echo "Clear old *.up.railway.app cookies, then sign in again on the app URL."

#!/usr/bin/env bash
# Deploy GT2 archive UI to dedicated Cloudflare Pages project gekkotrader2.
# NEVER deploy to Pages project `gekkotrader` (gt1 / old).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-gekkotrader2}"
if [ "$PAGES_PROJECT_NAME" = "gekkotrader" ]; then
  echo "ERROR: refusing to deploy to live Pages project gekkotrader." >&2
  exit 1
fi

(cd frontend && npm ci && npm run typecheck && npm test && npm run build)
DIST=frontend/dist
CONFIG="$DIST/config.js"
if [ ! -f "$CONFIG" ]; then
  echo "ERROR: missing $CONFIG after build" >&2
  exit 1
fi
if [ ! -f "$DIST/index.html" ] || [ ! -f "$DIST/_redirects" ] || [ ! -f "$DIST/_headers" ]; then
  echo "ERROR: incomplete dist/" >&2
  exit 1
fi

API_URL="${CONTROL_API_URL__PROJ_GEKKOTRADER2:-${CONTROL_API_URL:-}}"
UI_VERSION="$(date -u +%Y%m%d%H%M)"

python3 - "$CONFIG" "$API_URL" "$UI_VERSION" <<'PY'
import pathlib, re, sys
path, api_url, ui_version = sys.argv[1:4]
text = pathlib.Path(path).read_text()
if api_url:
    text = re.sub(
        r"(root\.GEKKO_API_URL\s*=\s*)[^;]+;",
        rf"root.GEKKO_API_URL = {api_url!r};",
        text,
        count=1,
    )
text = re.sub(
    r"(root\.GEKKO_UI_VERSION\s*=\s*)[^;]+;",
    rf"root.GEKKO_UI_VERSION = {ui_version!r};",
    text,
    count=1,
)
pathlib.Path(path).write_text(text)
print(f"Patched {path}: API={bool(api_url)} UI={ui_version}")
PY

if grep -qE '^name[[:space:]]*=[[:space:]]*"gekkotrader"' frontend/wrangler.toml; then
  echo "ERROR: wrangler.toml must not name Pages project gekkotrader." >&2
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required." >&2
  exit 1
fi
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

npx -y wrangler@latest pages deploy "$DIST" --project-name "$PAGES_PROJECT_NAME" --branch main

echo "Deployed to Pages project ${PAGES_PROJECT_NAME}."
echo "Canonical host: https://gt2.gekkotrader.com/"
echo "Alias: https://gt4old.gekkotrader.com/"
echo "Attach those custom domains on the Pages project if not already bound."

#!/usr/bin/env bash
# GT2 archive — Pages deploy helper (LOCKED).
#
# HARD STOP: This script refuses to publish. Cloudflare Pages project
# `gekkotrader` is the LIVE site for gt1.gekkotrader.com, old.gekkotrader.com,
# and the archive. Deploying from this repo would overwrite live config.js.
#
# Kept for the CONTROL_API_URL__PROJ_GEKKOTRADER patch pattern documentation.
# Do not enable until operators retarget a dedicated non-live Pages project
# AND set ALLOW_GEKKOTRADER2_PAGES_DEPLOY=1 deliberately.
#
# Public Control origin (document only; empty in-repo): https://api.gekkotrader.com  # pragma: allowlist secret
set -euo pipefail

PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-gekkotrader2-archive}"

echo "ERROR: Pages deploy is operator-locked in GekkoTrader2." >&2
echo "  Refusing wrangler pages deploy (would risk live project gekkotrader)." >&2
echo "  Placeholder project name (not created/deployed): ${PAGES_PROJECT_NAME}" >&2
echo "  Live hosts remain on Pages project gekkotrader — do not retarget or overwrite." >&2
echo "  Ship path for now: source + build only (see .github/workflows/deploy-frontend.yml)." >&2
exit 78

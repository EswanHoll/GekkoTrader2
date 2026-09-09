#!/usr/bin/env bash
# GT2 archive — intentionally inert.
#
# Upstream GekkoTrader1 used this to assert Pages project `gekkotrader` has
# git auto-deploy OFF. In this repo we must NOT call Cloudflare APIs against
# live project `gekkotrader` and we must not deploy.
#
# Placeholder only. Always succeeds without touching Cloudflare.
set -euo pipefail
echo "OK: check_pages_git_autodeploy skipped in GekkoTrader2 (deploy locked; live project gekkotrader untouched)."
exit 0

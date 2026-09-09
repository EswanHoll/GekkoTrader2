#!/usr/bin/env bash
# GT2 archive — cache-bust deploy tests are disabled while Pages publish is locked.
set -euo pipefail
echo "SKIP: test_deploy_frontend_cachebust disabled (operator lock — no Pages deploy)."
exit 0

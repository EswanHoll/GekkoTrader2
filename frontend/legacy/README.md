# GekkoTrader frontend (Cloudflare Pages)

Greenfield static dashboard shell for the LOCKED Scope Contract
(`execution_env` × `lane`, env-before-lane). No SPA framework — plain JS under
`frontend/`, deployed to Cloudflare Pages.

## Routes

| Path | Surface |
|------|---------|
| `/overview/` | Fleet desk summaries |
| `/status/` | Runtime status table |
| `/sim/<a\|b>/` | Sim desk (Sim A / Sim B) |
| `/sim/<a\|b>/results/` | Results summary |
| `/sim/<a\|b>/runs/` | Run board |
| `/demo/<a\|b>/…` | Demo desks (same surfaces) |
| `/live/` | Single live desk (dormant-safe, read-only) |
| `/audit/` | Promotion audit (read-only) |
| `/admin/…` | Users / Keys / Operator unlock |
| `/login/` | Auth |

Retired legacy path segments redirect to canonical routes via `_redirects`
(sources only — never used as API identity).

## Wire contract

- snake_case JSON only (no camelCase mapping layer)
- Every scoped `fetch` / `EventSource` sends `execution_env` (+ `lane` when not live)
- Reject payloads whose echoed scope ≠ requested scope
- Default: contract-shaped mock (`GEKKO_USE_MOCK_API=true` in `config.js`). Set
  `window.GEKKO_USE_MOCK_API = false` (or `localStorage.gekko_use_mock_api=false`)
  to hit the control API when App lane endpoints are ready.

## Brand

Nunito only across every user-visible interface surface, Gekko green `#00ff41`, dark `#1e1e24` / `#2a2a32`.

## Deploy

**Authoritative path only:** secret-patched Wrangler via `scripts/deploy_frontend.sh` or GitHub Actions `deploy-frontend`.  
Do **not** use Cloudflare Dashboard “Builds” / git auto-deploy for production — it uploads empty in-repo `GEKKO_API_URL` and breaks login (see [ADR-2026-07-26-PAGES-DEPLOY-AUTHORITY-WRANGLER-ONLY](../docs/architecture/decisions/ADR-2026-07-26-PAGES-DEPLOY-AUTHORITY-WRANGLER-ONLY.md)).

```bash
# CONTROL_API_URL__PROJ_GEKKOTRADER must already be in the environment (Cursor/GitHub secret).
./scripts/deploy_frontend.sh
```

Bumps `?v=` cache-bust on HTML entrypoints, patches `config.js` from secrets, deploys with Wrangler Pages, then restores empty placeholders in the working tree.

Guard (requires CF API token):

```bash
./scripts/check_pages_git_autodeploy.sh
```

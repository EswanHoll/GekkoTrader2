# GekkoTrader2

GT2 **archive UI** source for the dual-lane desk (Live / Demo / Sim A and B).

| | |
|---|---|
| Primary host | https://gt2.gekkotrader.com/ |
| Alias | https://gt4old.gekkotrader.com/ |
| Control API | https://api.gekkotrader.com (AWS Tokyo) |  <!-- pragma: allowlist secret -->
| Sign-in | `trader@gekkotech.co.za` (`eswan@` returns 401) |  <!-- pragma: allowlist secret -->
| Live Pages project (do not touch from here) | `gekkotrader` |

## What this repo is

- Cloudflare Pages **frontend only** (Vite React SPA under `frontend/`), imported from `EswanHoll/GekkoTrader1` `frontend/` (verified against live: `wrangler` name was `gekkotrader`, title `GekkoTrader`, favicon `/gekko-logo.png`, `/config.js`, sidebar wordmark matched the live miss before the chrome lock below).
- Dual-lane archive paths preserved (`/live/a/`, `/demo/b/`, `/sim/a/`, …). Not a GT3–6 single-lane product.
- Google auth (GIS) remains in the legacy login path; do not remove it.
- Favicon / brand mark: `/gekko-logo.png` (Gekko square logo already used by the live desk).

## Chrome lock (this repo)

Sidebar wordmark: **Gekko** (green) + **Trader2** (white). Gray subtitle `Control desk` removed.

## Secrets

**Secrets are not in this repo.** In-repo `frontend/public/config.js` keeps `GEKKO_API_URL` / Supabase fields empty on purpose. Production patches `CONTROL_API_URL__PROJ_GEKKOTRADER` (and optional Supabase values) at deploy time — same pattern as GekkoTrader1. Documented public Control origin: https://api.gekkotrader.com. Do not commit passwords, tokens, `.env` files, or Terraform state.  <!-- pragma: allowlist secret -->

## Deploy lock (HARD STOP)

**Do not wrangler-deploy from this repository.** Do not publish to Cloudflare Pages project `gekkotrader` (live for gt1, old, and the archive). A frontend deploy would overwrite live `config.js`.

| Artifact | Behavior here |
|---|---|
| `frontend/wrangler.toml` | `name = "gekkotrader2-archive"` — placeholder only; **not** created or deployed |
| `.github/workflows/deploy-frontend.yml` | **Build only** (typecheck + Vite build). Never calls Wrangler |
| `scripts/deploy_frontend.sh` | Exits immediately (locked); will not target `gekkotrader` |

Retargeting live Pages bindings is out of scope for this repo until operators say otherwise.

## Local build

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

## Left behind (not imported)

GekkoTrader1 Fly/trading backend, Terraform, canary/runtime deploy scripts, and other non-Pages backend workflows. GekkoTrader1 itself was not modified.

# GekkoTrader2

Dual-lane **archive UI** (Live / Demo A+B / Sim A+B). Frontend only.
Not a GT3–6 single-lane product.

| | |
|---|---|
| Canonical host | https://gt2.gekkotrader.com/ |
| Alias | https://gt4old.gekkotrader.com/ |
| Pages project | `gekkotrader2` (this repo only) |
| Control API | https://api.gekkotrader.com (AWS Tokyo) |
| Sign-in | `trader@gekkotech.co.za` (`eswan@` returns 401) |

**Never publish to Pages project `gekkotrader`.** That project is live for gt1 / old.

## What this repo is

- Cloudflare Pages Vite React SPA under `frontend/`.
- Dual-lane archive paths (`/live/`, `/demo/a/`, `/demo/b/`, `/sim/a/`, `/sim/b/`).
- Google auth (GIS) stays on the login path; do not remove it.
- Favicon / brand: `/gekko-logo.png`.
- Sidebar wordmark: **Gekko** (green) + **Trader2** (white).

## Secrets

Secrets are not in this repo. `frontend/public/config.js` leaves `GEKKO_API_URL` / Supabase empty.
Deploy patches `CONTROL_API_URL__PROJ_GEKKOTRADER2` (fallback `CONTROL_API_URL`).
Do not commit passwords, tokens, `.env`, or Terraform state.

## Deploy

Dedicated Pages project **`gekkotrader2`** → custom domain **gt2.gekkotrader.com** (alias gt4old).

```bash
# requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
./scripts/deploy_frontend.sh
```

CI on `main`: typecheck + `npm test` + build, then wrangler pages deploy to `gekkotrader2` only.
Attach the custom domain in the Cloudflare Pages dashboard; this repo does not change DNS.

## Local

```bash
cd frontend
npm ci
npm run typecheck
npm test
npm run build
```

## Out of scope

No Fly/trading backend, Terraform, or other product engines. Those live in GT3–6.
`frontend/legacy/` is the pre-React reference only — not the ship path.

# GekkoTrader2 frontend

React 19 + Vite + TypeScript under `src/`. Ship path is `frontend/dist/` to
Cloudflare Pages project **`gekkotrader2`** → https://gt2.gekkotrader.com/

Never deploy to Pages project `gekkotrader`.

`frontend/legacy/` is reference only — not the live ship path.

## Develop

```bash
cd frontend
npm install
npm run dev
```

http://localhost:5173/overview/

## Build / test

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

## Deploy

```bash
# from repo root — patches Control URL into dist/config.js, uploads dist/
./scripts/deploy_frontend.sh
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Optional: `CONTROL_API_URL__PROJ_GEKKOTRADER2` or `CONTROL_API_URL`.

## Brand

Nunito + JetBrains Mono, Gekko green `#00ff41`, dark `#1e1e24` / `#2a2a32`.

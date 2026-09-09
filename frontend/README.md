# GekkoTrader frontend

**Production = React 19 + Vite + TypeScript** under `frontend/src/`, deployed as
`frontend/dist/` to Cloudflare Pages (`gekkotrader.com`).

Classic vanilla files remain in `frontend/legacy/` for reference only — they are
**not** the live ship path.

## Develop

```bash
cd frontend
npm install
npm run dev
```

http://localhost:5173/overview/

## Build

```bash
npm run build
npm run preview
```

## Deploy (LOCKED)

Wrangler + secret-patched `public/config.js` only — never Cloudflare git
auto-deploy
([ADR-2026-07-26](../docs/architecture/decisions/ADR-2026-07-26-PAGES-DEPLOY-AUTHORITY-WRANGLER-ONLY.md)).

```bash
./scripts/deploy_frontend.sh
```

Runs `npm ci && npm run build`, patches Control API URL into `config.js`, uploads
`dist/`.

## Brand

Nunito + JetBrains Mono, Gekko green `#00ff41`, dark `#1e1e24` / `#2a2a32`.

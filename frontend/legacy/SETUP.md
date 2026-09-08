# Frontend setup (greenfield shell)

## Local preview

Serve `frontend/` as static files (any static server). Example:

```bash
cd frontend && python3 -m http.server 8787
```

Open `http://localhost:8787/overview/`. Real Control is the default
(`GEKKO_USE_MOCK_API=false`). For offline shell work, opt in to mocks
(`GEKKO_USE_MOCK_API=true` or `localStorage.setItem("gekko_use_mock_api","true")`).

## Scope selector

1. Choose **Env** (Sim / Demo / Live).
2. For Sim/Demo, choose **Lane** (A / B). Live has no lane picker.
3. Desk URLs are always env-before-lane: `/demo/a/`, `/sim/b/runs/`, `/live/`.

## Operator unlock

Admin → Keys saves `OPERATOR_CONTROL_SECRET` once on the device (via
`operator.js`). Sessions are short-lived. This UI does **not** activate live
capital.

## Control API URL (required)

| Layer | Name |
|-------|------|
| Cursor + GitHub Actions secret | **`CONTROL_API_URL__PROJ_GEKKOTRADER`** (ADR-0006) |
| Browser runtime (`config.js`) | `window.GEKKO_API_URL` (patched at deploy from the scoped secret) |

The secret value must be the **AWS Tokyo Control ALB** HTTPS origin.
The operator supplies the hostname — the UI does **not** invent one and does
**not** default to `*.fly.dev`.

- Cloudflare Pages deploy (`./scripts/deploy_frontend.sh` / Actions) requires
  `CONTROL_API_URL__PROJ_GEKKOTRADER`.
- Deprecated alias: bare `GEKKO_API_URL` env is accepted with a warning only when
  the scoped name is unset — **do not** create bare `GEKKO_API_URL` as the
  primary operator secret path.
- If unset in a production build, the UI fails closed with an operator-facing
  banner (no silent Fly fallback).
- Legacy Fly Control is opt-in only: set the scoped secret explicitly to that host.

## Swap mock → control API

Mock is **off** by default (GST-12). To force mocks locally:

1. `window.GEKKO_USE_MOCK_API = true` in `config.js`, or
2. `localStorage.setItem("gekko_use_mock_api", "true")` in the browser.

## Deploy

```bash
CONTROL_API_URL__PROJ_GEKKOTRADER="https://<operator-supplied-tokyo-control-alb>" \
  ./scripts/deploy_frontend.sh
```

Requires Pages credentials + scoped Control URL secret. Always bumps `?v=` cache-bust.

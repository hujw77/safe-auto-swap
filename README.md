# Safe Auto Swap

Safe Auto Swap is a Safe App that loads token balances for the connected Safe, lets the operator select which ERC20s to convert, requests quote-backed router calldata, and submits the resulting approvals plus swap calls as one Safe batch.

## What is included

- React + Vite frontend optimized for Safe iframe usage
- Safe Apps SDK integration to detect `safeAddress` and `chainId`
- OKX balance proxy that signs `all-token-balances-by-address` requests server-side
- Quote proxy for `quotesV2`
- Batch construction flow:
  - load balances
  - select tokens
  - preview quotes
  - check ERC20 allowances
  - prepend approvals when needed
  - send the Safe batch with `sdk.txs.send({ txs })`

## Environment

Copy [.env.example](/Volumes/Samsung/rust/solver/okx/auto-swap/.env.example) to `.env` and fill in:

- `OKX_ACCESS_KEY`
- `OKX_SECRET_KEY`
- `OKX_ACCESS_PASSPHRASE`
- `OKX_ACCESS_PROJECT`

Optional local-only fallback values:

- `VITE_SAFE_ADDRESS`
- `VITE_CHAIN_ID`

Optional frontend-direct test mode values:

- `VITE_SOR_ROUTER_BASE_URL`
- `VITE_OKX_BASE_URL`
- `VITE_OKX_ACCESS_KEY`
- `VITE_OKX_SECRET_KEY`
- `VITE_OKX_ACCESS_PASSPHRASE`
- `VITE_OKX_ACCESS_PROJECT`

## Development

```bash
npm install
npm run dev
```

- Frontend: `https://localhost:5173`
- Backend proxy: `http://localhost:8787`

If you want to temporarily test a pure-frontend flow, set the `VITE_OKX_*` variables above. In that mode the browser signs OKX requests directly and quote requests go straight to `VITE_SOR_ROUTER_BASE_URL` when `VITE_API_BASE_URL` is empty.

For local browser debugging outside Safe:

- set `VITE_SAFE_ADDRESS`
- set `VITE_CHAIN_ID`
- optionally set `VITE_LOCAL_WALLET_SEND=true` to send transactions through an injected wallet instead of using dry-run mode

When testing as a custom Safe App in [app.safe.global](https://app.safe.global), open `https://localhost:5173` in a separate tab once and trust the local certificate first. Safe's docs require the app URL and Safe interface to use the same protocol, and `manifest.json` must be served with CORS headers.

## Single-service deployment

If your goal is "only deploy one service", this repo already supports that pattern:

- the Express server serves `/api/*`
- the same Express server also serves the built frontend from `dist/`
- you only need one public URL for Safe to load

Use this flow:

```bash
npm ci
npm run build:single
npm run start:single
```

Then expose the single server URL, for example:

- `https://your-app.example.com/`
- `https://your-app.example.com/manifest.json`

Important:

- I did not move the OKX signing secret into the frontend, because that would leak `OKX_SECRET_KEY` to every browser.
- "One deployment" is safe and supported.
- "Pure frontend with no server" is not safe for the current OKX balance API design.

This repo now also includes:

- [Dockerfile](/Volumes/Samsung/rust/solver/okx/auto-swap/Dockerfile) for container deployment
- [render.yaml](/Volumes/Samsung/rust/solver/okx/auto-swap/render.yaml) for Render

## GitHub Pages

The frontend can be deployed to GitHub Pages. For your current frontend-direct test mode, the build can also embed the `VITE_OKX_*` values directly into the bundle.

### Setup steps

1. Push this repo to GitHub.
2. In the GitHub repo, go to `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Edit [.env.production](/Volumes/Samsung/rust/solver/okx/auto-swap/.env.production) in the repo and fill:

- `VITE_OKX_ACCESS_KEY`
- `VITE_OKX_SECRET_KEY`
- `VITE_OKX_ACCESS_PASSPHRASE`
- `VITE_OKX_ACCESS_PROJECT`

Leave these defaults unless you need different endpoints:

- `VITE_API_BASE_URL=`
- `VITE_SOR_ROUTER_BASE_URL=https://sor-router.helixbox.ai`
- `VITE_OKX_BASE_URL=https://web3.okx.com`

5. Commit and push to `main`.
6. After deployment, the app URL will be:

- `https://<github-username>.github.io/<repo-name>/`

The Safe manifest URL will be:

- `https://<github-username>.github.io/<repo-name>/manifest.json`

### Current workflow behavior

The included workflow automatically sets:

- `VITE_BASE_PATH=/<repo-name>/`

and loads the rest of the production config from the tracked `.env.production` file.

### Notes

What works on GitHub Pages:

- the Safe App frontend
- `manifest.json`
- quote requests routed to an external API backend
- frontend-direct OKX testing if you intentionally inject `VITE_OKX_*` into the build

What still needs a backend elsewhere:

- `/api/tokens` because it signs OKX requests with `OKX_SECRET_KEY`
- optionally `/api/quote` if you want to avoid browser-to-upstream CORS dependency

If you later switch back to the safer architecture, keep `VITE_API_BASE_URL=https://<your-backend-domain>` and remove the `VITE_OKX_*` frontend variables.

### One-step deploy

After `.env.production` is filled once and committed, future deployments are just:

```bash
git push origin main
```

## Current assumptions

- This build focuses on ERC20 input tokens. Native token swaps are shown but not executable yet.
- The quote endpoint is expected to return executable `tx_data.to` and `tx_data.data`. When `swap_data.executors` is present, it is surfaced in the preview pipeline for later debugging, but the batch currently trusts the router calldata returned by the quote API.
- Default target tokens are configured per chain in [src/config/chains.ts](/Volumes/Samsung/rust/solver/okx/auto-swap/src/config/chains.ts).

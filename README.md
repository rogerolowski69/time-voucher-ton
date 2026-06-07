# Time Voucher (TON)

Pay TON to mint **TIME** jettons — prepaid vouchers for one hour of consulting. Redeem by transferring TIME back to the issuer and booking on Cal.com.

## Project layout

```
contracts/          Jetton minter + wallet (Tolk)
scripts/            Deploy, buy-time, withdraw, admin ops
tests/              Contract tests (acton test)
wrappers/           Generated Acton wrappers
web/
  api/              FastAPI — events, Telegram auth, TonConnect manifest
  src/              Astro + Preact landing page (buy / redeem)
  public/           Static assets (icon.svg)
```

## Contracts

- **JettonMinter** — TEP-74 minter with `BuyTime` (pay-to-mint), `SetMintPrice`, `WithdrawTon`
- **JettonWallet** — standard per-user jetton wallet

```bash
just build          # compile contracts
just test           # run tests
just deploy-testnet # deploy minter to testnet
just buy-time-testnet
```

## Web app

Stack: **Astro** (static) + **Preact** (wallet UI) + **Tailwind** / shadcn-style components + **FastAPI** (API + production static host).

```bash
just web-install    # npm + Python venv
just web-dev        # Astro :4321 + API :8787
just web-build      # build static site to web/dist/
just web-start      # FastAPI serves dist/ + API (production)
```

Copy `web/.env.example` → `web/.env` and set `PUBLIC_MINTER_ADDRESS`, `PUBLIC_REDEEM_ADDRESS`, etc. Server secrets (`TELEGRAM_BOT_TOKEN`, `ADMIN_API_TOKEN`) stay in the same file — never use the `PUBLIC_` prefix for those.

### Deploy on Railway

1. Push this repo to GitHub and connect it in Railway.
2. Leave **Root Directory** empty (deploy from repo root).
3. Add a **volume** mounted at `/data`.
4. Generate a **public domain**.

**Build-time variables** (set before first deploy — Astro bakes these in):

| Variable | Example |
|----------|---------|
| `PUBLIC_MINTER_ADDRESS` | Deployed JettonMinter address |
| `PUBLIC_NETWORK` | `testnet` or `mainnet` |
| `PUBLIC_REDEEM_ADDRESS` | Issuer TON wallet |
| `PUBLIC_CAL_COM_URL` | `https://cal.com/your-link` |
| `PUBLIC_ISSUER_EMAIL` | Support email |
| `PUBLIC_TELEGRAM_BOT_USERNAME` | Bot username (no `@`) |

**Runtime variables**:

| Variable | Value |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `ADMIN_API_TOKEN` | Random secret for `/api/admin/events` |
| `DATA_DIR` | `/data` |
| `LOG_JSON` | `true` |

Health check: `GET /api/health`. TonConnect manifest and static site served by FastAPI.

## Acton / Toncenter

Copy `.env.example` → `.env` for `TONCENTER_TESTNET_API_KEY` when hitting rate limits:

```bash
acton wallet new --name deployer --local --airdrop
```

## CI

`.github/workflows/contracts.yml` — build, format, lint, test on push/PR.

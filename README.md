# Impact Wallet Server

Backend API for **Impact Wallet** (Equity Wallet) — a platform for owning organization equity onchain. Users join orgs, earn or buy equity, contribute time/work, and settle payments in USDC and related Solana tokens.

## Stack

| Layer | Tech |
| --- | --- |
| Framework | [NestJS](https://nestjs.com/) 9 (TypeScript) |
| Database | MongoDB via [Mongoose](https://mongoosejs.com/) |
| Blockchain | [Solana](https://solana.com/) (`@solana/web3.js`, SPL Token, Metaplex) |
| Auth | JWT (`@nestjs/jwt`) |
| Jobs | [Agenda](https://github.com/agenda/agenda) (Mongo-backed) |
| Payments | Stripe, CandyPay, DePlan webhooks |
| Storage | AWS S3 (avatars, org logos) |
| API docs | Swagger UI at `/docs` |

## Features

- **Users & wallets** — profiles, avatars, Solana wallets, USDC/credits transfers, onboarding bonuses
- **Organizations** — create/update orgs, logos, treasury settings, revenue, membership, USDC send/receive
- **Members & equity** — roles, equity allocations, compensation, investor settings
- **Offers** — equity/sale offers within orgs (full and `lite` APIs)
- **Contributions** — start/stop work contributions tied to orgs
- **Payments & deposits** — checkout flows, merchant/CandyPay/Stripe/DePlan webhooks, credit deposits
- **Airdrops** — claim/create airdrop transactions for DePlan
- **Socials** — Twitter follow/OAuth callbacks
- **Background jobs** — refund unused onboarding bonus credits on a schedule

## Project structure

```
src/
├── account/          # USDC history, credit deposits (Stripe)
├── airdrop/          # Token airdrop claim flows
├── api-service/      # Solana RPC, transfers, minting, DEX, Stripe, CandyPay
├── auth/             # JWT account resolution (`/auth/me`)
├── configuration/    # Runtime app config
├── contributions/    # Member contributions
├── deposit/          # Credit deposit processing
├── jobs-service/     # Agenda scheduled jobs
├── members/          # Org membership & equity models
├── offers/           # Equity / sale offers
├── orgs/             # Organizations, revenue, splits, payments
├── payment/          # Payment webhooks & settlement
├── s3/               # AWS S3 uploads
├── socials/          # Twitter integration
├── users/            # User CRUD, balances, asset transfers
└── main.ts           # Bootstrap + Swagger
```

Many domains expose both full and **`lite`** controllers/services (e.g. `orgs.controller.lite.ts`) for a reduced API surface under `/lite/...`.

## Prerequisites

- **Node.js** 18+ (matches `@types/node`)
- **npm**
- **MongoDB** with a replica set (required by Agenda / local Docker setup)
- Solana RPC access and keys for fee payer / mints (see env below)

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Start MongoDB (Docker)

```bash
docker compose up -d
```

This runs Mongo on `localhost:27017` with replica set `rs0`. Initialize the replica set once if needed:

```bash
docker compose exec mongodb_container mongosh --eval 'rs.initiate({_id:"rs0", members:[{_id:0, host:"localhost:27017"}]})'
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in required values (see [Environment variables](#environment-variables)). At minimum for local boot:

- `MONGODB_URI` — e.g. `mongodb://localhost:27017/impact_wallet?replicaSet=rs0`
- `PORT` — defaults to `9898`
- `PRIVATE_KEY` — JWT signing secret
- Solana-related vars when exercising chain features

### 4. Run the server

```bash
# development (watch mode)
npm run start:dev

# production build + run
npm run build
npm run start:prod
```

API: `http://localhost:9898`  
Swagger: `http://localhost:9898/docs`

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Nest watch mode |
| `npm run start:debug` | Watch + Node inspector on `9339` |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled `dist/main.js` |
| `npm run lint` | ESLint with autofix |
| `npm run format` | Prettier |
| `npm test` | Unit tests (Jest) |
| `npm run test:e2e` | E2E tests |

## API overview

Interactive docs live at **`/docs`**. Main route groups:

| Prefix | Purpose |
| --- | --- |
| `/auth` | Current account from Bearer JWT |
| `/users` | Users, login, balances, USDC/assets |
| `/orgs` | Orgs, members, revenue, payments, logos |
| `/offers`, `/orgs/:orgId/offers` | Equity & sale offers |
| `/users/:userId/contributions`, `/orgs/:orgId/contributions` | Contributions |
| `/account` | USDC history, credit deposit |
| `/payment` | Payment webhooks (Stripe, CandyPay, DePlan, merchant) |
| `/airdrop` | Airdrop claim |
| `/socials` | Twitter follow / OAuth |
| `/config` | App configuration |
| `/solana` | Low-level transfer helper |
| `/lite/...` | Lite variants of orgs, users, offers, contributions |

Auth: send `Authorization: Bearer <jwt>` on protected routes. Tokens are issued on user/org login.

## Environment variables

`.env.example` covers a subset. Variables used across the codebase:

### Core

| Variable | Description |
| --- | --- |
| `ENV` | Environment flag (`DEV` / `PROD`) |
| `PORT` | HTTP port (default `9898`) |
| `MONGODB_URI` | Mongo connection string |
| `PRIVATE_KEY` | JWT secret |
| `APP_URL` | Frontend base URL (checkout redirects) |
| `SERVER_URL` | Public API base URL (webhooks, image URLs, OAuth callback) |

### Solana

| Variable | Description |
| --- | --- |
| `NETWORK` | Cluster name (e.g. `devnet`, `mainnet-beta`) |
| `SOLANA_RPC_URL` | Read RPC endpoint |
| `SOLANA_RPC_URL_WRITE` | Write RPC endpoint |
| `FEE_PAYER` | Fee-payer public key |
| `FEE_PAYER_PWD` | Fee-payer secret / unlock material |
| `ROOT_PUBKEY` | Root/treasury wallet |
| `USDC_MINT` | USDC mint address |
| `CREDITS_MINT` | Credits token mint |
| `DEPLAN_MINT` | DePlan token mint |
| `SHYFT_KEY` | Shyft API key |
| `PRIORITY_FEE_MICRO_LAMPORTS` | Optional priority fee |
| `COMMISSION` | Platform commission rate |

### Onboarding & jobs

| Variable | Description |
| --- | --- |
| `ONBOARDING_ENABLED` | Enable onboarding bonus |
| `ONBOARDING_BONUS` | Bonus amount |
| `BONUS_RETURN_ENABLED` | Enable Agenda refund job |
| `BONUS_RETURN_FREQUENCY` | e.g. `1minute`, `1hour` |
| `BONUS_WALLET_EXPIRATION_INTERVAL_MIN` | Bonus wallet TTL (minutes) |

### Payments & storage

| Variable | Description |
| --- | --- |
| `STRIPE_SK` / `STRIPE_WHSEC` / `STRIPE_CREDIT_PRICE` | Stripe keys & price |
| `CANDYPAY_PUBKEY` / `CANDYPAY_KEY` / `CANDYPAY_WHSEC` | CandyPay |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_PUBLIC_BUCKET_NAME` | S3 |

### Airdrop & social

| Variable | Description |
| --- | --- |
| `AIRDROP_SIZE` | Airdrop allocation size |
| `AIRDROP_SENDER_PUBLIC_KEY` / `AIRDROP_SENDER_SK` / `AIRDROP_WALLET_SECRET_KEY` | Sender keys |
| `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` | Twitter OAuth |
| `DEPLAN_TWITTER_ID` | Target account for follow checks |
| `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID` | Optional notifications |
| `NOTIFICATIONS_ENABLED` | Toggle Telegram notifications |

Keep secrets out of git — `.env` is gitignored.

## Deployment

`Procfile` runs production as:

```text
web: npm run start:prod
```

Build the Nest app (`npm run build`) before starting so `dist/main.js` exists. CORS is enabled; raw body is enabled for webhook signature verification (e.g. Stripe).

## Local HTTPS proxy (optional)

`proxy.js` is a local TLS reverse proxy that forwards `/api` to this server (`9898`) and other traffic to port `10001`. Useful when developing against a local frontend that expects HTTPS; paths and cert locations are hardcoded for that setup.

## License

Private / unlicensed (`UNLICENSED` in `package.json`).

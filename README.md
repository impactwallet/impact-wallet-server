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

- **Node.js** 22 (for running outside Docker)
- **npm**
- **MongoDB** with a replica set (required by Agenda / local Docker setup)
- Solana RPC access and keys for fee payer / mints (see env below)

## Run with Docker

Requires Docker with Compose v2. The multi-stage image uses Node.js 22,
installs dependencies with `npm ci`, and runs the compiled API as a non-root user.
Build tools and development dependencies stay out of the runtime image.

1. Create your local configuration (skip this if `.env` already exists):

   ```bash
   cp .env.example .env
   ```

2. Set `PRIVATE_KEY` to your JWT secret and `STRIPE_SK` to a Stripe test key.
   `SOLANA_RPC_URL` must be a valid HTTP(S) URL; the example uses devnet.
   Set `BONUS_RETURN_ENABLED=false` and `ONBOARDING_ENABLED=false` if you are
   only exploring the API without configured wallets. Configure the other
   provider credentials before exercising their integrations.

3. Build and start:

   ```bash
   docker compose up --build -d
   docker compose ps
   docker compose logs -f api
   ```

API: `http://localhost:9898`; Swagger: `http://localhost:9898/docs`.
`PORT` in `.env` changes the host port; the API listens on 9898 inside Docker.
Compose injects the internal MongoDB URI, overriding `MONGODB_URI` from `.env`.
Secrets are loaded at runtime and excluded from the Docker build context.

MongoDB 7.0 runs as a single-node replica set, initialized automatically by its
health check. The API starts after MongoDB becomes primary. The replica set
advertises `localhost:27017`; clients use `directConnection=true` so the same
single-node setup works from the host and from the API container.
Data persists in the existing `mongodb_data_container` named volume.
If that volume was created by a different MongoDB major version, check its
upgrade compatibility before reusing it; do not downgrade newer data to 7.0.

Both ports bind to localhost. This Compose setup is for local development;
MongoDB has no authentication configured. `MONGO_PORT` changes its host port.
The API health check probes `/docs-json` for HTTP liveness, not external provider
availability. Shutdown signals reach Node and Nest shutdown hooks stop Agenda.

```bash
# Rebuild after code changes
docker compose up --build -d api

# Stop containers, preserving database data
docker compose down
```

`docker compose down -v` also deletes the database volume; use it only when you
intend to discard local data.

## Develop inside Docker

Configure `.env` as described above, then start the development image:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f api
```

Nest runs in watch mode: edit files in `src/` on your host and the API rebuilds
and restarts automatically. Polling enables file change detection on Docker
Desktop. TypeScript and Nest configuration files are also bind-mounted.
Linux dependencies and generated `dist/` stay inside the container, so host
`node_modules` and build output cannot overwrite them. No host npm install is
needed. The development image includes all development dependencies.

Swagger is at `http://localhost:9898/docs`. Attach your Node.js debugger to
`localhost:9339` (or `DEBUG_PORT` from `.env`), with local project root mapped
to `/app`. The inspector binds to all interfaces inside the container but is
published only on localhost.

```bash
# Run tests inside the development container
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test -- --runInBand

# Rebuild after changing package.json, package-lock.json or the Dockerfile
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d api

# Stop development containers and keep MongoDB data
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

The development override uses the same Compose project and MongoDB volume as
the default setup. To switch back to the compiled runtime image, run
`docker compose up --build -d api` without the override.

## Run Node.js on the host

Use Node.js 22 and the same `.env` configuration described above:

```bash
npm ci
docker compose up -d mongodb_container
npm run start:dev
```

For this mode, set `MONGODB_URI` to
`mongodb://localhost:27017/impact_wallet?replicaSet=rs0&directConnection=true`.
If `MONGO_PORT` is customized, update the URI accordingly. Stop the containerized
API (`docker compose stop api`) before running the host API on the same port.

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

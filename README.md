# Amini — Believe · Transparent Verifiable Fund Disbursement

Web3 platform for transparent, traceable fund transfers using stablecoins on Base. Milestone releases are gated by **EAS (Ethereum Attestation Service)** attestations.

## Repo structure

- **packages/contracts** — Foundry (Solidity): CampaignRegistry, MilestoneEscrow (EAS-gated)
- **packages/shared** — Shared TypeScript types and chain config
- **packages/eas-schemas** — EAS schema definitions and encode/decode helpers
- **packages/frontend** — Next.js dashboard (Coinbase Smart Wallet / CDP, OnchainKit, wagmi, Base)
- **supabase/** — Postgres schema snapshot ([`supabase/schema.sql`](./supabase/schema.sql)) and ordered migrations ([`supabase/migrations/`](./supabase/migrations/)); see [`supabase/README.md`](./supabase/README.md)

## Prerequisites

- Node 18+, pnpm
- Foundry (forge, cast)

## Setup

```bash
pnpm install
```

Copy `.env.example` to `.env` and set:

- `NEXT_PUBLIC_CDP_PROJECT_ID` and `NEXT_PUBLIC_CDP_API_KEY` (Coinbase Developer Platform). The project id enables the **CDP embedded wallet** (in-app / passkey smart wallet); without it, local builds use a Coinbase Wallet fallback only.
- **CDP embedded wallet details** (email login, Base + Base Sepolia, portal allowlist): [docs/CDP_EMBEDDED_WALLET.md](./docs/CDP_EMBEDDED_WALLET.md).
- Contract addresses after deploy (see below)
- World ID config for Sybil verification:
  - `NEXT_PUBLIC_WORLDCOIN_APP_ID`
  - `NEXT_PUBLIC_WORLDCOIN_ACTION`
  - `WORLDCOIN_ACTION`
  - `WORLDCOIN_RP_ID`
  - `WORLDCOIN_RP_SIGNING_KEY`

You can check readiness via `GET /api/world-id/health`.
There is also an in-app debug view at `/debug/world-id`.

**Database** — apply migrations in [`supabase/migrations/`](./supabase/migrations/) to your Supabase project (see [`supabase/README.md`](./supabase/README.md)). Regenerate a local snapshot with `pnpm db:dump-schema` (requires `SUPABASE_DB_URL` or `DATABASE_URL`).

**IPFS (Filebase)** — for impact posts and other server uploads, set `FILEBASE_ACCESS_KEY`, `FILEBASE_SECRET_KEY`, and `FILEBASE_BUCKET` (see [`.env.example`](./.env.example)). If your database still uses legacy `arweave_*` column names on `impact_posts`, apply [`supabase/migrations/20250101000004_legacy_rename_arweave_columns_to_ipfs.sql`](./supabase/migrations/20250101000004_legacy_rename_arweave_columns_to_ipfs.sql) (idempotent).

## Build & test

```bash
# All packages
pnpm build

# Contracts only
pnpm --filter @amini/contracts build
pnpm --filter @amini/contracts test

# Frontend
pnpm dev
```

## Deploy contracts (Base Sepolia)

1. Register EAS schema for milestone completion (see [EAS docs](https://docs.attest.sh)); set the returned schema UID.
2. Set `PRIVATE_KEY` and optional `BASE_SEPOLIA_RPC_URL` in `.env`.
3. Run:

```bash
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

4. Update `.env` with deployed `CampaignRegistry` and `MilestoneEscrow` addresses.

## Plan

See [PLAN.md](./PLAN.md) for the full build plan (indexing, IPFS/Filebase, XMTP, Superfluid, reputation).

## Demo docs

- Demo script: [docs/DEMO_RUNBOOK.md](./docs/DEMO_RUNBOOK.md)
- Constraints/trade-offs: [docs/ARCHITECTURE_CONSTRAINTS.md](./docs/ARCHITECTURE_CONSTRAINTS.md)

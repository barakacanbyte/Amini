# Architecture

## Current Constraints

- **Supabase is centralized infra**: index/state queries depend on Supabase availability.
- **XMTP is in-app only**: no push notification service is included.
- **Sybil verification source**: reputation visibility depends on a World ID verification record in `sybil_verifications`.
- **IPFS uploads are server-mediated (Filebase)**: uploads go through frontend API routes with configured Filebase S3 credentials; content is pinned to IPFS.
- **Indexer eventual consistency**: explorer/feed updates are near-real-time, not instant.

## Security & Trust Assumptions

- Contract addresses and schema UID are correctly configured in env.
- Only EAS-valid attestations are accepted for release in escrow contract logic.
- Service role credentials are stored securely and never exposed client-side.

## Future Hardening Candidates

- Add robust World ID verification endpoint and proof validation pipeline.
- Add idempotency + retry queues for indexer writes.
- Add monitoring/alerts for indexer lag and API upload failures.
- Add stronger content moderation controls for impact posts.

## Monorepo Structure

```
packages/
  contracts/   — Foundry smart contracts (CampaignRegistry, MilestoneEscrow)
  frontend/    — Next.js app (CDP wallet, CDS UI, Supabase client)
  shared/      — Shared TypeScript types and utilities
  eas-schemas/ — EAS schema definitions and helpers
apps/
  indexer/     — On-chain event indexer (writes to Supabase)
supabase/
  migrations/  — Database migrations
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity + Foundry, UUPS proxies |
| Chain | Base / Base Sepolia |
| Token | USDC (ERC-20) |
| Attestations | EAS (Ethereum Attestation Service) |
| Frontend | Next.js, Wagmi, Coinbase CDS |
| Auth / Wallet | CDP Embedded Wallet (email OTP) |
| Database | Supabase (Postgres + RLS) |
| File storage | Filebase (S3-compatible, IPFS pinning) |
| Messaging | XMTP (in-app only) |
| Indexer | TypeScript + viem, reads on-chain events |

# Amini — Transparent, Verifiable Fund Disbursement on Base

Amini is a Web3 platform that brings **accountability to charitable funding**. Organizations create milestone-based campaigns. Donors fund specific milestones with USDC on Base. Funds are held in escrow and only released when the organization proves completion and an admin issues an **EAS (Ethereum Attestation Service)** attestation on-chain.

Every dollar is traceable. Every milestone is verifiable. Organizations can't change what they received. Donors see exactly where their money went.

**Built on:** Base (Coinbase L2) · Coinbase Developer Platform · OnchainKit · USDC · EAS · XMTP · World ID · Supabase · IPFS (Filebase)

## The Problem

Traditional charitable giving is opaque. Donors send money and hope it reaches the right people. Organizations self-report impact with no independent verification. There's no public, immutable record of how funds were actually used.

## How Amini Solves It

Amini introduces a **milestone-gated funding model** where money follows proof, not promises:

1. **Organizations** create campaigns with defined milestones and funding targets
2. **Donors** fund the current open milestone with USDC — future milestones are locked until progress is proven
3. **Organizations** complete the work and submit proof (photos, documents, descriptions) uploaded to IPFS
4. **Volunteers** verify the work on the ground
5. **Admin** reviews the evidence, issues an **EAS attestation** on-chain
6. **Smart contract** validates the attestation and releases funds to the beneficiary
7. **Next milestone unlocks** — the cycle repeats

All deposits, releases, and attestations are permanently recorded on Base. Donor lists are public (or anonymous by choice). Impact posts are pinned to IPFS.

## Key Features

### On-Chain Funding Engine
- **USDC deposits** held in a milestone escrow contract on Base
- **Milestone-gated funding** — donors can only fund the current open milestone; future milestones are locked until the previous one is attested and released
- **General donations** also supported for donors who don't want to target a specific milestone
- **Sequential milestone releases** — admin-only, validated against EAS attestations
- **UUPS upgradeable proxies** — contracts can be improved without losing state

### Proof & Attestation Pipeline
- Organizations **upload completion proof** (title, description, evidence files to IPFS)
- Admin dashboard shows a **proof review queue** with evidence links
- Admin clicks "Approve" and the app **issues the EAS attestation** directly from the connected wallet
- Attestation UID is stored and displayed as a **public badge** on the milestone
- Badge links to the attestation on EAS Scan for anyone to verify

### Donor Experience
- Choose to appear as a **visible donor** (name + avatar) or **anonymous**
- Leave an optional **message** with your donation
- See a **live preview** of how your donation will appear before confirming
- **Segmented control** for anonymity — clear, not confusing
- Donation preferences stored off-chain (linked by tx hash); on-chain data stays immutable

### Campaign Pages
- Full campaign detail with **hero image, description, tags, region, cause, deadline**
- **Milestone cards** showing open/locked/released state, progress bars, donor pills, proof status, and EAS badges
- **Impact feed** — IPFS-pinned updates with optional file attachments
- **Comments** — wallet-verified, threaded discussion
- **XMTP messaging** — encrypted wallet-to-wallet chat scoped to each campaign
- **QR code + share link** for easy distribution
- **Transparency explorer** — search indexed deposits and releases

### Organization Profiles
- **Registration** with logo, description, country, social links, ENS, Coinbase verification
- **Social feed** — organizations post updates with media (images to IPFS), likes, comments, shares
- **Activity feed** with scored ranking and cursor pagination
- **Prior projects** section for track record
- **Admin approval** required before an org can create campaigns

### Dashboards
- **Donor dashboard** — overview of supported campaigns
- **Organization dashboard** — campaign stats, public profile management
- **Admin dashboard** — platform metrics, pending org verifications, milestone proof review queue with one-click EAS attestation

### Identity & Trust
- **Coinbase Developer Platform** embedded wallet (passkey / email login via Smart Wallet)
- **OnchainKit** wallet UI and identity components
- **World ID** Sybil verification for campaign beneficiaries
- **Reputation scores** computed from attested milestones and Sybil verification status

### Indexer
- Node.js service polling Base for `CampaignCreated`, `FundsDeposited`, and `MilestoneReleased` events
- Mirrors on-chain data to Supabase for fast reads
- Updates reputation scores on milestone releases

## Architecture

```
Donor Wallet                     Organization Wallet
     |                                   |
     | USDC deposit                      | Submit proof (IPFS)
     v                                   v
+------------------+            +------------------+
| MilestoneEscrow  |            | milestone_proofs |  (Supabase)
| (Base contract)  |            | (off-chain DB)   |
+------------------+            +------------------+
     |                                   |
     | Holds funds, gates               | Admin reviews
     | by releasedCount                  v
     |                          +------------------+
     |                          | Admin Dashboard  |
     |                          | Issues EAS       |
     |                          +------------------+
     |                                   |
     |    attestation UID                |
     |<----------------------------------+
     |
     | releaseMilestone(attestationUID)
     | validates EAS, transfers USDC
     v
Beneficiary Wallet
```

### On-Chain (immutable, trustless)
- Campaign registry (owner, beneficiary, target, milestones)
- Escrow balances and deposit records
- Milestone release order and amounts
- EAS attestation validation
- Beneficiary payouts

### Off-Chain (UX, moderation, speed)
- Donor display preferences (anonymous/visible, messages)
- Milestone proof uploads and review workflow
- Organization profiles, social feed, comments
- Indexed copies of on-chain events for fast queries
- XMTP messaging bindings
- World ID / reputation scores

## Repo Structure

```
packages/
  contracts/     Foundry — CampaignRegistry + MilestoneEscrow (UUPS, EAS-gated)
  shared/        TypeScript types, ABIs, chain constants
  eas-schemas/   EAS encode/decode helpers + attestation creation
  frontend/      Next.js 16 app (App Router, wagmi, OnchainKit, CDP)
apps/
  indexer/       Node.js event indexer (Base -> Supabase)
supabase/
  schema.sql     Reference schema snapshot
  migrations/    24 ordered SQL migrations
docs/            Architecture, deployments, constraints, demo, branding
scripts/         Schema dump, ABI export, drift check
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Base (Coinbase L2), Base Sepolia testnet |
| **Smart Contracts** | Solidity 0.8.24, Foundry, OpenZeppelin UUPS |
| **Stablecoin** | USDC on Base |
| **Attestations** | Ethereum Attestation Service (EAS) |
| **Wallet** | Coinbase Developer Platform embedded wallet (Smart Wallet / passkey) |
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, wagmi, viem |
| **UI Kit** | Coinbase Design System (`@coinbase/cds-web`), OnchainKit |
| **Database** | Supabase (PostgreSQL, RLS, RPCs) |
| **Storage** | IPFS via Filebase (S3-compatible pinning) |
| **Messaging** | XMTP (encrypted wallet-to-wallet, campaign-scoped) |
| **Identity** | World ID (Sybil resistance for beneficiaries) |
| **CI/CD** | GitHub Actions (lint, build, forge test, Slither, Vercel preview) |

## Deployed Contracts (Base Sepolia)

| Contract | Proxy Address |
|----------|--------------|
| CampaignRegistry | `0xA2E3D5FBCdAd2Afd864d315a907C01076ccA35cB` |
| MilestoneEscrow | `0xFbd60d72F412E1df2646dcd48A0c0DbF6c5e361A` |

EAS Schema UID: `0x18e9a692ecf6adbe3c27beadcaef53e888bbca8e38b59f11655fc73494a248f9`

See [`docs/CONTRACT_DEPLOYMENTS.md`](./docs/CONTRACT_DEPLOYMENTS.md) for implementation addresses and upgrade history.

## Getting Started

### Prerequisites

- Node 18+ and [Bun](https://bun.sh)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast)
- A [Supabase](https://supabase.com) project
- A [Coinbase Developer Platform](https://portal.cdp.coinbase.com) project

### Install

```bash
git clone https://github.com/AminiBelieve/Amini.git
cd Amini
bun install
```

### Configure

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CDP_PROJECT_ID` | CDP embedded wallet |
| `NEXT_PUBLIC_CDP_API_KEY` | CDP API access |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server only) |
| `NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS` | Deployed registry proxy |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | Deployed escrow proxy |
| `NEXT_PUBLIC_EAS_PORTAL_ADDRESS` | EAS contract (`0x4200...0021` on Base) |
| `NEXT_PUBLIC_EAS_SCHEMA_UID` | Registered milestone schema UID |
| `FILEBASE_ACCESS_KEY`, `FILEBASE_SECRET_KEY`, `FILEBASE_BUCKET` | IPFS uploads |
| `NEXT_PUBLIC_WORLDCOIN_APP_ID`, `NEXT_PUBLIC_WORLDCOIN_ACTION` | World ID |

See [`.env.example`](./.env.example) for the full list with comments.

CDP embedded wallet setup: [`docs/CDP_EMBEDDED_WALLET.md`](./docs/CDP_EMBEDDED_WALLET.md)

### Apply Database Migrations

```bash
# Using Supabase CLI
supabase db push
```

Or apply each file in [`supabase/migrations/`](./supabase/migrations/) in order. See [`supabase/README.md`](./supabase/README.md).

### Deploy Contracts

```bash
cd packages/contracts

# Fresh deployment
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify

# Upgrade existing proxies
REGISTRY_PROXY_ADDRESS=<proxy> ESCROW_PROXY_ADDRESS=<proxy> \
  forge script script/Upgrade.s.sol --rpc-url base_sepolia --broadcast
```

### Run

```bash
# Frontend (Next.js dev server)
bun dev

# Indexer (watches Base for events)
bun dev:indexer

# Contract tests
bun test:contracts
```

## App Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/campaigns` | Campaign explorer |
| `/campaigns/create` | Create a new campaign (org-gated) |
| `/campaigns/[id]` | Campaign detail, funding, milestones, messaging |
| `/organizations/register` | Register an organization |
| `/organizations/[id]` | Public org profile with social feed |
| `/activity` | Ranked activity feed across organizations |
| `/explorer` | Transparency explorer for on-chain data |
| `/messages` | XMTP messaging hub |
| `/profile/[handle]` | Public user profile |
| `/dashboard/donor` | Donor dashboard |
| `/dashboard/organization` | Organization dashboard |
| `/dashboard/admin` | Admin control center |

## API Endpoints

<details>
<summary>Expand full API reference</summary>

### Campaigns
- `GET /api/campaigns/[id]` — campaign detail with deposits, releases, donors, impact, comments
- `POST /api/campaigns` — persist a new on-chain campaign to Supabase
- `POST /api/campaigns/metadata` — upload campaign metadata + image to IPFS
- `POST /api/campaigns/draft` — save/load campaign creation drafts
- `POST /api/campaigns/[id]/comments` — wallet-verified threaded comments
- `POST /api/campaigns/[id]/xmtp-thread` — store XMTP conversation binding
- `GET/POST /api/campaigns/[id]/milestone-proofs` — list/submit milestone evidence

### Organizations
- `GET/POST /api/organizations` — lookup or register organizations
- `GET/PATCH /api/organizations/[id]` — read or update org profile
- `GET/POST /api/organizations/[id]/posts` — org social feed
- `PATCH/DELETE /api/organizations/[id]/posts/[postId]` — edit/delete posts
- `GET/POST /api/organizations/[id]/posts/[postId]/comments` — post comments
- `POST/DELETE /api/organizations/[id]/posts/[postId]/likes` — toggle likes
- `POST /api/organizations/[id]/posts/[postId]/shares` — record shares

### Feed & Profiles
- `GET /api/feed` — paginated activity feed (scored ranking)
- `GET /api/feed/post` — single post by ID
- `GET/PATCH /api/profiles/[wallet]` — public profile read/update

### Donations
- `POST /api/donations/preferences` — donor anonymity and message preferences
- `POST /api/impact` — publish impact posts with IPFS attachments

### Admin (wallet-gated)
- `GET /api/admin/stats` — platform metrics
- `GET /api/admin/organizations/pending` — pending org queue
- `POST /api/admin/organizations/[id]/approve` — approve org
- `POST /api/admin/organizations/[id]/reject` — reject org
- `GET /api/admin/milestone-proofs` — pending proof review queue
- `POST /api/admin/milestone-proofs/[id]/review` — approve/reject proof

### World ID
- `GET /api/world-id/health` — config readiness check
- `POST /api/world-id/rp-signature` — RP signing for IDKit
- `POST /api/world-id/verify` — verify World ID proof

</details>

## Contract Architecture

See [`docs/CONTRACT_ARCHITECTURE.md`](./docs/CONTRACT_ARCHITECTURE.md) for a full reviewer-oriented explanation covering:

- Why there are two contracts and how they interact
- Milestone-gated funding logic (`deposit` gate: `milestoneIndex <= releasedCount`)
- Sequential release with EAS attestation validation
- Admin-only release (`onlyOwner` on `releaseMilestone`)
- What is enforced on-chain vs handled off-chain
- Trust assumptions and security properties

## CI / CD

All workflows use **Bun** (matching the repo's package manager) and `oven-sh/setup-bun`.

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | Push/PR to main | ESLint, Prettier check, build all TS packages, forge build + test |
| `contracts.yml` | Contract source/test/script changes | Forge build, test with gas report, coverage summary, gas snapshot on PRs |
| `deploy-preview.yml` | PR to main | Vercel preview deployment with PR comment (requires `VERCEL_TOKEN` secret) |
| `security.yml` | Push/PR + weekly schedule | `bun pm audit` for critical vulns, Slither static analysis with SARIF upload |

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/CONTRACT_ARCHITECTURE.md`](./docs/CONTRACT_ARCHITECTURE.md) | Full contract logic explanation for reviewers |
| [`docs/CONTRACT_DEPLOYMENTS.md`](./docs/CONTRACT_DEPLOYMENTS.md) | Proxy/implementation addresses, upgrade commands |
| [`docs/CDP_EMBEDDED_WALLET.md`](./docs/CDP_EMBEDDED_WALLET.md) | Coinbase Developer Platform wallet setup |
| [`docs/ARCHITECTURE_CONSTRAINTS.md`](./docs/ARCHITECTURE_CONSTRAINTS.md) | Current trade-offs and trust assumptions |
| [`docs/ADMIN_DASHBOARD.md`](./docs/ADMIN_DASHBOARD.md) | Admin workflows and routes |
| [`docs/UI_CDS_BRANDING.md`](./docs/UI_CDS_BRANDING.md) | Design system and CDS usage |
| [`docs/DEMO_RUNBOOK.md`](./docs/DEMO_RUNBOOK.md) | Step-by-step demo script |
| [`supabase/README.md`](./supabase/README.md) | Database migration guide |

## License

MIT

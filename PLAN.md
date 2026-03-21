# Amini — Full Build Plan

**Believe · Transparent Verifiable Fund Disbursement**

This plan covers the complete implementation of the Amini platform per the System Prompt v2.0: smart contracts, EAS attestations, frontend, indexing, storage, messaging, streaming, and Sybil-resistant reputation.

---

## 1. Repository structure

```
amini/
├── packages/
│   ├── contracts/          # Foundry (Solidity) — escrow, campaigns, registry
│   ├── frontend/           # Next.js + TypeScript + Tailwind
│   ├── eas-schemas/        # EAS schema definitions + attestation helpers (TS)
│   └── shared/             # Shared types, constants, ABIs (TS)
├── apps/
│   └── indexer/            # Optional: Supabase edge functions / webhook consumers
├── docs/                   # Architecture, API, runbooks
├── scripts/                # Deploy, seed, dev scripts
├── .env.example
├── package.json            # Workspace root (pnpm/npm)
└── PLAN.md                 # This file
```

- **contracts**: Foundry project; deploy to Base (testnet then mainnet).
- **frontend**: Single Next.js app (dashboard, campaign creation, explorer, wallet connect).
- **eas-schemas**: EAS schema JSON + TypeScript utilities to create/verify attestations on Base.
- **shared**: Types (Campaign, Milestone, Attestation), chain config, contract addresses, ABI exports.
- **indexer**: Logic to backfill and listen to chain + EAS events and write to Supabase (can be scripts or Edge Functions).

---

## 2. Phase overview

| Phase | Focus | Outcome |
|-------|--------|---------|
| **0** | Repo, tooling, env | Monorepo, env vars, lint, format |
| **1** | Core contracts | Escrow, campaign registry, USDC on Base |
| **2** | EAS layer | Schema + integration with escrow release |
| **3** | Frontend core | Wallet connect, dashboard, campaign CRUD, USDC transfer |
| **4** | Indexing & data | Supabase schema, indexer, fund flow data |
| **5** | Arweave & impact | Post impact + receipts to Arweave, link to txs |
| **6** | XMTP | Wallet-to-wallet messaging scoped to campaigns |
| **7** | Superfluid | Optional streaming escrow/disbursement |
| **8** | Reputation & Sybil | Worldcoin/EAS social + reputation scoring |
| **9** | Polish & demo | Fund flow viz, QR donation links, explorer, branding |

---

## 3. Phase 0 — Repo and tooling

- [ ] Initialize pnpm/npm workspace; create `packages/contracts`, `packages/frontend`, `packages/eas-schemas`, `packages/shared`, `apps/indexer`.
- [ ] **Contracts**: Init Foundry (`forge init`), add remappings, configure for Base (Base Sepolia + Base Mainnet).
- [ ] **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind; add shared package as dependency.
- [ ] **Shared**: Define base types (Campaign, Milestone, WalletAddress, etc.); no runtime deps on chain.
- [ ] **EAS package**: Node/TS package; EAS schema JSON; dependency on `shared` for types.
- [ ] `.env.example`: `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_USDC`, `NEXT_PUBLIC_ESCROW`, `NEXT_PUBLIC_EAS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ARWEAVE_*`, `XMTP_*`, `WORLDSCOIN_*`, etc.
- [ ] ESLint, Prettier, and (optional) Turborepo for task orchestration.

**Deliverable:** Monorepo where `pnpm build` builds contracts + frontend + shared; `pnpm dev` runs frontend.

---

## 4. Phase 1 — Core smart contracts

- [ ] **USDC**: Use existing USDC on Base; no custom token. Configure address in shared + env.
- [ ] **Campaign registry**: Contract that emits `CampaignCreated(campaignId, owner, targetAmount, milestonesCount, ...)`. Store minimal on-chain data (owner, target, currency, milestone count); optional: IPFS/Arweave URI for metadata.
- [ ] **Escrow contract**:
  - Accept USDC; support one escrow per campaign (or per campaign+milestone depending on design).
  - State: campaign id, beneficiary, amounts per milestone, current milestone index.
  - `releaseMilestone(campaignId, milestoneIndex)` (or similar) **gated by**:
    - Either a trusted “validator” set, or
    - **EAS attestation**: contract checks that a valid EAS attestation exists for `(campaignId, milestoneId)` from an allowed schema/attester before releasing.
  - Emit events: `FundsDeposited`, `MilestoneReleased`, `CampaignCompleted`.
- [ ] **EAS integration in contract**: Resolve EAS portal address on Base; implement `IEAS` interface check (attestation exists, schema matches, attester in allowlist if used). Prefer one canonical schema for “milestone completion”.
- [ ] Tests: Unit tests for escrow (deposit, release with/without attestation); fork Base Sepolia if needed.
- [ ] Deploy scripts: Deploy to Base Sepolia first; persist addresses in `shared` and `.env`.

**Deliverable:** Deployed escrow + registry on Base Sepolia; release only after valid EAS attestation.

---

## 5. Phase 2 — EAS layer

- [ ] **Schema**: Define EAS schema for “Milestone completion” (e.g. `campaignId`, `milestoneId`, `evidenceHash`, `timestamp`, optional `recipient`). Register schema on EAS on Base.
- [ ] **Document schema**: In `eas-schemas/`, add JSON schema and a short doc (name, fields, who attests).
- [ ] **TS helpers**: In `packages/eas-schemas`, add functions: `createMilestoneAttestation(provider, signer, schemaId, payload)`, `getAttestation(uid)` (read from EAS graph or RPC). Use `shared` types where applicable.
- [ ] **Frontend use**: “Validator” (or donor) flow: after recipient posts proof, validator signs attestation via EAS; frontend calls contract `releaseMilestone` only after attestation is on-chain (or contract reads EAS in same tx via pre-check).
- [ ] Ensure contract and EAS schema IDs are in `shared` and env so frontend and indexer stay in sync.

**Deliverable:** One registered EAS schema on Base; TS SDK to create/read attestations; escrow release fully gated by attestation.

---

## 6. Phase 3 — Frontend core

- [ ] **Wallet connection**: Coinbase Smart Wallet + CDP embedded wallet (OnchainKit + wagmi; chain: Base).
- [ ] **Dashboard**: After connect, show list of “My campaigns” (created or funded); link to create campaign and to explorer.
- [ ] **Create campaign**: Form: title, description, target amount (USDC), beneficiary address, list of milestones (description, amount per milestone). On submit: create campaign in registry (if needed), then optionally create escrow record; store metadata (title, description) on Arweave or in Supabase and link from chain (recommend Supabase for speed, Arweave for critical proof).
- [ ] **Campaign page**: Show campaign details, milestones, funding progress; “Fund with USDC” button that triggers USDC approval + transfer to escrow.
- [ ] **USDC transfer**: Use wagmi/viem to call USDC.approve + Escrow.deposit (or equivalent); show tx status and success state.
- [ ] **Recipient view**: For beneficiary wallet: list milestones; “Mark complete” triggers flow: upload proof to Arweave (Phase 5) → then “Request attestation” (validator signs EAS) → then “Release” (contract checks EAS and releases). Alternatively “Release” is single button that backend/validator uses after attestation.
- [ ] **Branding**: Apply palette (Midnight Indigo, Emerald Signal, Solar Amber, Cloud White, Slate Graphite); Inter or Manrope; minimalist explorer aesthetic.

**Deliverable:** Users can connect wallet, create campaigns, fund with USDC, and (with validator) complete milestone flow with EAS and release.

---

## 7. Phase 4 — Indexing and fund flow

- [ ] **Supabase**: Create project; define tables: `campaigns` (id, chain_campaign_id, owner, target_amount, metadata_url, created_at), `escrow_deposits` (campaign_id, depositor, amount, tx_hash, block), `milestone_releases` (campaign_id, milestone_index, amount, tx_hash, attestation_uid), `attestations` (uid, campaign_id, milestone_id, attester, evidence_hash, created_at). Add views or functions for “fund flow” (donor → campaign → recipient).
- [ ] **Indexer**: Script or Edge Function that:
  - Subscribes to or polls chain for `CampaignCreated`, `FundsDeposited`, `MilestoneReleased`; and optionally to EAS attestation events.
  - Writes to Supabase; idempotent by tx_hash or log index.
- [ ] **Frontend**: “Fund flow” visualization: fetch from Supabase (by campaign or by wallet); show Donor → Campaign → Recipient with amounts and tx links. Block finality ~2s on Base; refresh every few seconds or on focus.
- [ ] **Transparency explorer**: Public page: search by campaign id, wallet address, or tx hash; list campaigns with filters; link to campaign page and to Base scan.

**Deliverable:** All on-chain and EAS events reflected in Supabase; dashboard and explorer show fund flow and search.

---

## 8. Phase 5 — Arweave and impact feed

- [ ] **Upload pipeline**: When recipient (or validator) adds “impact post” (text + optional image/receipt): build JSON or structured data; upload to Arweave (e.g. via Bundlr or Arweave SDK); get tx id.
- [ ] **Link to chain**: Store `arweave_tx_id` in Supabase (e.g. `impact_posts` table: campaign_id, milestone_id, author_wallet, arweave_tx_id, tx_hash_link, created_at). Optionally store same id on-chain in next milestone attestation or in a separate “proof” contract if needed.
- [ ] **Impact feed UI**: On campaign page, “Impact” section: list posts from Supabase; each post links to Arweave permalink and to related on-chain tx; show photo/receipt if stored in Arweave.
- [ ] **Receipts**: Same pipeline for “receipt” uploads (e.g. proof of purchase); permanent on Arweave; reference in EAS evidence_hash or in metadata.

**Deliverable:** Impact posts and receipts stored on Arweave; feed on campaign page with permanent links and tx association.

---

## 9. Phase 6 — XMTP messaging

- [ ] **XMTP setup**: Use XMTP SDK (wallet-to-wallet); configure client in frontend (env: API keys if required).
- [ ] **Scoping**: Conversations or threads keyed by `campaignId` (and optionally milestone or “donor–recipient” pair). When user opens campaign page, load or create conversation for that campaign.
- [ ] **In-app only**: No push server; polling or in-app “Refresh” for new messages. Document as “in-app messaging” in demo.
- [ ] **UI**: Campaign page: “Messages” tab or panel; show thread; compose and send; show sender wallet (short) and timestamp.

**Deliverable:** Donors and recipients can message each other per campaign via XMTP inside the app.

---

## 10. Phase 7 — Superfluid streaming (optional)

- [ ] **Design**: Either “streaming escrow” (funds stream from escrow to recipient over time) or “streaming donation” (donor streams to campaign). Align with “milestone-based streaming” in system prompt: stream rate can change or halt on milestone flag.
- [ ] **Superfluid on Base**: Use Superfluid contracts on Base; create stream from escrow (or donor) to recipient; flow rate derived from milestone schedule or fixed rate.
- [ ] **Integration**: Optional path in “Fund campaign”: “Lump sum” vs “Stream”; if Stream, create/start Superfluid stream and (if applicable) link to escrow/campaign in your indexer.
- [ ] **Halt on dispute**: If milestone is flagged, stop or reduce stream (Superfluid APIs for stopping/updating stream); document behavior in UI.

**Deliverable:** Optional per-campaign streaming disbursement with start/stop tied to milestones or disputes.

---

## 11. Phase 8 — Reputation and Sybil resistance

- [ ] **Sybil layer**: Integrate Worldcoin World ID (or EAS social attestation) for “verified human” or “unique identity” before allowing reputation to count. Without this, do not expose “reputation score” as authoritative.
- [ ] **Reputation model**: Reputation = f(attested milestones, role, time). Only EAS-attested milestone completions count; self-reported milestones do not. Store in Supabase: `reputation_scores` (wallet, score, attested_count, last_updated).
- [ ] **Computation**: Indexer or cron: aggregate attestations per wallet (recipient/validator); apply formula; write to `reputation_scores`. Frontend: show “Reputation” only when user has passed Sybil check (World ID or EAS social).
- [ ] **UI**: Profile or campaign page: “Reputation: X (from N attested milestones)” with “Verified by World ID” (or equivalent) badge.

**Deliverable:** Reputation score derived from EAS attestations only; visible only with Sybil guard (Worldcoin/EAS social).

---

## 12. Phase 9 — Polish and demo

- [ ] **Fund flow visualization**: Refine UI (e.g. Sankey or step diagram) from Supabase data; real-time feel (poll every 2–5s).
- [ ] **QR donation links**: Per-campaign short link; QR code generation; link opens campaign page with “Fund” CTA pre-focused.
- [ ] **Explorer**: Search, filters, sort; campaign cards with progress; link to Base Scan for every tx.
- [ ] **Demo script**: Align with “Hackathon Demo Flow” in system prompt: connect wallet → create campaign → send USDC → show fund flow → impact post (Arweave) → validator attestation (EAS) → escrow release → XMTP thread → reputation (with Sybil).
- [ ] **Docs**: Short README (run frontend, deploy contracts, env vars); architecture diagram; “Constraints” section (oracle, XMTP in-app, Supabase centralized, Arweave not IPFS).

**Deliverable:** Demo-ready app with QR, explorer, and documented constraints.

---

## 13. Dependency order (summary)

```
Phase 0 (repo) 
  → Phase 1 (contracts) 
  → Phase 2 (EAS) 
  → Phase 3 (frontend core) 
  → Phase 4 (indexing) — can start after 1
  → Phase 5 (Arweave) — after 3
  → Phase 6 (XMTP) — after 3
  → Phase 7 (Superfluid) — after 1, 3
  → Phase 8 (Reputation) — after 2, 4
  → Phase 9 (polish) — after 4–8
```

- **Critical path:** 0 → 1 → 2 → 3 (must work for “core demo”).
- **Parallel after 3:** 4 (indexer), 5 (Arweave), 6 (XMTP); then 7, 8, 9.

---

## 14. Environment variables (checklist)

- `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_EAS_PORTAL_ADDRESS`, `NEXT_PUBLIC_EAS_SCHEMA_UID`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (for indexer)
- `ARWEAVE_KEYFILE` or Bundlr/Arweave API keys
- XMTP env (per SDK docs)
- Worldcoin / EAS social app ids and secrets (for Phase 8)
- Superfluid host/subgraph URLs for Base (Phase 7)

---

## 15. Success criteria (full build)

- [ ] Wallet connect + USDC transfer on Base.
- [ ] Campaign creation and escrow with milestone-based release.
- [ ] Milestone release gated **only** by valid EAS attestation (no manual backdoor).
- [ ] Fund flow visualization from Supabase; public explorer.
- [ ] Impact posts and receipts on Arweave; linked to campaigns/txs.
- [ ] XMTP messaging per campaign (in-app).
- [ ] Optional Superfluid streaming path.
- [ ] Reputation from EAS attestations with Sybil layer (Worldcoin or EAS social).
- [ ] QR donation links and branding applied.
- [ ] Demo script and “Architectural constraints” documented.

---

*Amini · believe · v2.0 · Full build plan · March 2026*
